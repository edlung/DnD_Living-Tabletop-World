#if os(iOS)
import SwiftUI
import UIKit

/// The app delegate both apps start from (docs/adr/0070-native-apps.md §3, §8); each app's own file
/// is only `@main final class AppDelegate: ShellAppDelegate {}`. The scenes are named in the apps'
/// Info.plist: the game window (`LTWGameSceneDelegate`), and in LTW DM the TV
/// (`LTWTVSceneDelegate`).
open class ShellAppDelegate: UIResponder, UIApplicationDelegate {
    public func application(
        _ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        Self.keepWebDataOffBackups()
        return true
    }

    /// The session cookie stays on this device: WebKit's data is kept out of iCloud and computer
    /// backups (ADR 0070 §3).
    private static func keepWebDataOffBackups() {
        guard let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        for name in ["WebKit", "Cookies"] {
            var folder = library.appending(path: name, directoryHint: .isDirectory)
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? folder.setResourceValues(values)
        }
    }
}

/// The game window's scene: the game, and the shell's part of the app's lifecycle.
@objc(LTWGameSceneDelegate)
public final class GameSceneDelegate: UIResponder, UIWindowSceneDelegate {
    public var window: UIWindow?
    private var game: GameViewController?

    public func scene(
        _ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let scene = scene as? UIWindowScene else { return }
        shellLog.info("game scene connected")
        let window = UIWindow(windowScene: scene)
        let game = GameViewController()
        window.rootViewController = game
        window.backgroundColor = Theme.inkUI
        window.makeKeyAndVisible()
        self.window = window
        self.game = game
        if Shell.kind == .dm, Shell.launchArgument("ltwTvPreview") == "YES" { showTvPreview(on: scene) }
    }

    private var tvPreview: UIWindow?

    /// Debug builds only (`-ltwTvPreview YES`): the TV's window in a corner of this screen, as an
    /// external screen would get it, so the simulator's journeys exercise the TV without one.
    private func showTvPreview(on scene: UIWindowScene) {
        let bounds = scene.coordinateSpace.bounds
        let size = CGSize(width: 480, height: 270)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(
            x: bounds.width - size.width - 16, y: bounds.height - size.height - 96, width: size.width,
            height: size.height)
        window.windowLevel = .normal + 1
        window.layer.borderColor = UIColor(Theme.gold).cgColor
        window.layer.borderWidth = 2
        let controller = TVController()
        window.rootViewController = controller
        window.isHidden = false
        tvPreview = window
        TVHub.shared.attach(controller)
    }

    public func sceneWillEnterForeground(_ scene: UIScene) {
        Alerts.shared.cameBack()
    }

    public func sceneDidEnterBackground(_ scene: UIScene) {
        Alerts.shared.leftView()
    }

    private var cover: UIView?

    /// LTW DM with a TV (§6): as the app leaves the screen iOS mirrors this device again, and the
    /// app switcher shows a snapshot of it; a cover hides the DM's page from both.
    public func sceneWillResignActive(_ scene: UIScene) {
        guard Shell.kind == .dm, TVHub.shared.hasTV, cover == nil, let window else { return }
        let cover = UIHostingController(rootView: PrivacyCover()).view ?? UIView()
        cover.frame = window.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(cover)
        self.cover = cover
    }

    public func sceneDidBecomeActive(_ scene: UIScene) {
        cover?.removeFromSuperview()
        cover = nil
    }
}
#endif
