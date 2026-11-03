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
    private let askedKey = "ltw.asked-notifications"
    private static let waitsID = "ltw.waits"
    private static let reminderID = "ltw.reminder"

    func haptic(_ kind: PageMessage.HapticKind) {
        switch kind {
        case .alert: UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .dice: UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.7)
        }
    }

    /// The screen stays on while any reason holds it: a window's play session, the DM's TV.
    func keepAwake(_ on: Bool, reason: String, asks: Bool = false) {
        if on { awakeReasons.insert(reason) } else { awakeReasons.remove(reason) }
        UIApplication.shared.isIdleTimerDisabled = !awakeReasons.isEmpty
        if on && asks { askOnce() }
    }

    /// The page's count of what waits: the badge, and news while out of view.
    func onWaiting(_ count: Int) {
        let baseline = waiting
        waiting = count
        center.setBadgeCount(count, withCompletionHandler: nil)
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

    /// Asked once, when a play session first keeps the screen on.
    private func askOnce() {
        guard !UserDefaults.standard.bool(forKey: askedKey) else { return }
        UserDefaults.standard.set(true, forKey: askedKey)
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
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
