#if os(iOS)
import SwiftUI
import UIKit

/// The client's tokens (`apps/web/src/styles/tokens.css`), so the shell's own screens match it.
enum Theme {
    static let ink = Color(red: 0x0A / 255, green: 0x11 / 255, blue: 0x19 / 255)
    static let inkDeep = Color(red: 0x05 / 255, green: 0x09 / 255, blue: 0x0E / 255)
    static let glass = Color(red: 0x0B / 255, green: 0x10 / 255, blue: 0x17 / 255).opacity(0.88)
    static let lineStrong = Color(red: 0xDC / 255, green: 0xE4 / 255, blue: 0xEC / 255).opacity(0.3)
    static let text = Color(red: 0xEC / 255, green: 0xE6 / 255, blue: 0xDA / 255)
    static let textMuted = Color(red: 0xA9 / 255, green: 0xA2 / 255, blue: 0x94 / 255)
    static let gold = Color(red: 0xC9 / 255, green: 0xA4 / 255, blue: 0x5C / 255)
    static let goldBright = Color(red: 0xE6 / 255, green: 0xC7 / 255, blue: 0x84 / 255)
    static let teal = Color(red: 0x46 / 255, green: 0xC0 / 255, blue: 0xDC / 255)
    static let tealFill = Color(red: 0x12 / 255, green: 0x3F / 255, blue: 0x56 / 255)
    static let danger = Color(red: 0xE2 / 255, green: 0x5B / 255, blue: 0x45 / 255)

    static let inkUI = UIColor(red: 0x0A / 255, green: 0x11 / 255, blue: 0x19 / 255, alpha: 1)

    /// GPT art from the client's UI kit: the key art behind sign-in, and the emblem.
    static let keyArt = UIImage(named: "brand-keyart.webp", in: .module, with: nil) ?? UIImage()
    static let emblem = UIImage(named: "emblem.webp", in: .module, with: nil) ?? UIImage()
}

/// The client's buttons: primary (teal), plain (a faint fill and a line), quiet (muted words).
struct ShellButtonStyle: ButtonStyle {
    enum Kind { case primary, plain, quiet }
    let kind: Kind

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(kind == .primary ? .bold : .medium))
            .foregroundStyle(kind == .quiet ? Theme.textMuted : Theme.text)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(kind == .primary ? Theme.tealFill : kind == .plain ? Theme.text.opacity(0.04) : .clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(kind == .primary ? Theme.teal : kind == .plain ? Theme.lineStrong : .clear)
            )
            .opacity(configuration.isPressed ? 0.75 : 1)
            .contentShape(Rectangle())
    }
}
#endif
