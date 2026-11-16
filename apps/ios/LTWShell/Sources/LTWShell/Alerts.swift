#if os(iOS)
import LTWCore
import UIKit
import UserNotifications

/// The alerts a page cannot give alone (docs/adr/0070-native-apps.md §5): a vibration on an iPhone
/// too, the screen kept on, the app's badge, and while the app is out of view a notification when
/// more waits for the player — or one reminder a minute after leaving with something waiting. A
/// notification says only "The table is waiting for you": a private check never shows on a lock
/// screen. No push service.
@MainActor
final class Alerts {
    static let shared = Alerts()

    /// The last count a page told; nil until a new page has told its first, which is never news.
    private var waiting: Int? = 0
    /// Game windows in front (an iPad may show more than one of LTW DM's); each counts itself in
    /// as its scene enters the foreground, the first one at launch too.
    private var windowsInView = 0
    private var inView: Bool { windowsInView > 0 }
    private var awakeReasons = Set<String>()
    private var background: UIBackgroundTaskIdentifier = .invalid
    private let center = UNUserNotificationCenter.current()
    /// The question about notifications was put, or found needless, in this launch.
    private var asked = false
    /// "No, thanks" to that question: the one thing the shell stores besides servers, nothing of the game.
    private let declinedKey = "ltw.notifications-declined"
    private static let waitsID = "ltw.waits"
    private static let reminderID = "ltw.reminder"

    func haptic(_ kind: PageMessage.HapticKind) {
        switch kind {
        case .alert: UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .dice: UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.7)
        }
    }

    /// The screen stays on while any reason holds it: a window's play session, the DM's TV.
    func keepAwake(_ on: Bool, reason: String) {
        if on { awakeReasons.insert(reason) } else { awakeReasons.remove(reason) }
        UIApplication.shared.isIdleTimerDisabled = !awakeReasons.isEmpty
    }

    /// The page's count of what waits: the badge, and news while out of view. The first time
    /// something waits, the window that heard it asks whether to notify.
    func onWaiting(_ count: Int, in window: UIViewController) {
        let baseline = waiting
        waiting = count
        center.setBadgeCount(count, withCompletionHandler: nil)
        if count > 0 { askToNotify(in: window) }
        guard let baseline else { return }
        if !inView && count > baseline { post(Self.waitsID, after: nil) }
        if count == 0 {
            center.removePendingNotificationRequests(withIdentifiers: [Self.reminderID])
            center.removeDeliveredNotifications(withIdentifiers: [Self.waitsID, Self.reminderID])
        }
    }

    /// A new page starts counting afresh: its first count is a baseline, never news.
    func forgetCount() {
        waiting = nil
    }

    func leftView() {
        windowsInView = max(0, windowsInView - 1)
        guard !inView else { return }
        if (waiting ?? 0) > 0 { post(Self.reminderID, after: 60) }
        // A short while to hear the table before iOS suspends the app; one task at a time.
        guard background == .invalid else { return }
        background = UIApplication.shared.beginBackgroundTask(withName: "ltw.table") { [weak self] in
            self?.endBackground()
        }
    }

    func cameBack() {
        windowsInView += 1
        endBackground()
        center.removePendingNotificationRequests(withIdentifiers: [Self.reminderID])
        center.removeDeliveredNotifications(withIdentifiers: [Self.waitsID, Self.reminderID])
    }

    private func endBackground() {
        guard background != .invalid else { return }
        UIApplication.shared.endBackgroundTask(background)
        background = .invalid
    }

    /// Notifications are asked for where they matter (§5): when the table first waits for the
    /// person, in view, with the shell's own question before the system's. A permission already
    /// given or refused is left alone, and "No, thanks" is remembered for good.
    private func askToNotify(in window: UIViewController) {
        guard !asked, inView, Self.canAsk(in: window), !UserDefaults.standard.bool(forKey: declinedKey)
        else { return }
        asked = true
        Task { [weak window] in
            guard await center.notificationSettings().authorizationStatus == .notDetermined else { return }
            guard let window, inView, Self.canAsk(in: window) else {
                // The window took up something else meanwhile: the next count asks.
                asked = false
                return
            }
            let question = UIAlertController(
                title: L("notify.title"), message: L("notify.text"), preferredStyle: .alert)
            question.addAction(
                UIAlertAction(title: L("notify.later"), style: .cancel) { [declinedKey] _ in
                    UserDefaults.standard.set(true, forKey: declinedKey)
                })
            let go = UIAlertAction(title: L("notify.continue"), style: .default) { [center] _ in
                center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
            }
            question.addAction(go)
            question.preferredAction = go
            window.present(question, animated: true)
        }
    }

    /// A game window on screen with nothing over it: the scanner, a sheet or the page's own dialog
    /// is never interrupted.
    private static func canAsk(in window: UIViewController) -> Bool {
        window.viewIfLoaded?.window != nil && window.presentedViewController == nil
    }

    private func post(_ id: String, after seconds: TimeInterval?) {
        let content = UNMutableNotificationContent()
        content.title = L("waits.title")
        content.body = L("waits.text")
        content.sound = .default
        let trigger = seconds.map { UNTimeIntervalNotificationTrigger(timeInterval: $0, repeats: false) }
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
#endif
