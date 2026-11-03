#if os(iOS)
import LTWCore
import SwiftUI

/// What the start screen says (docs/adr/0070-native-apps.md §1).
@MainActor
final class StartModel: ObservableObject {
    enum State: Equatable {
        case connecting(host: String)
        case failed(host: String)
    }

    @Published var state: State = .connecting(host: "")
    var retry: () -> Void = {}
    var scan: () -> Void = {}
    var server: () -> Void = {}
}

/// The shell's start screen in the client's look: the GPT key art full-bleed behind a glass panel
/// with the GPT emblem, as the sign-in page has it.
struct StartView: View {
    @ObservedObject var model: StartModel

    var body: some View {
        ZStack {
            // The art fills the screen without widening it: the panel keeps the screen's width.
            Color.clear
                .overlay(Image(uiImage: Theme.keyArt).resizable().scaledToFill())
                .clipped()
                .ignoresSafeArea()
                .accessibilityHidden(true)
            LinearGradient(
                colors: [Theme.inkDeep.opacity(0.5), Theme.inkDeep.opacity(0.7), Theme.inkDeep.opacity(0.95)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()
            ScrollView {
                panel
                    .padding(24)
                    .frame(maxWidth: 496)
                    .frame(maxWidth: .infinity)
                    .containerRelativeFrame(.vertical, alignment: .center) { length, _ in length }
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .preferredColorScheme(.dark)
    }

    private var panel: some View {
        VStack(spacing: 14) {
            Image(uiImage: Theme.emblem)
                .resizable()
                .scaledToFit()
                .frame(width: 72, height: 72)
                .accessibilityHidden(true)
            Text(L("start.title"))
                .font(.system(size: 28, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.goldBright)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
            switch model.state {
            case .connecting(let host):
                Text(L("start.connecting", host))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                ProgressView()
                    .tint(Theme.gold)
                    .controlSize(.large)
                    .padding(.top, 4)
            case .failed(let host):
                Text(L("start.unreachable", host))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.updatesFrequently)
                Button(L("start.retry"), action: model.retry)
                    .buttonStyle(ShellButtonStyle(kind: .primary))
                    .padding(.top, 6)
                Button(L("start.scan"), action: model.scan)
                    .buttonStyle(ShellButtonStyle(kind: .plain))
                Button(L("start.server"), action: model.server)
                    .buttonStyle(ShellButtonStyle(kind: .quiet))
            }
        }
        .padding(24)
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.glass))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.lineStrong))
    }
}

/// Which server to play on (§1): typed, chosen before, or the default one.
struct ServerSheet: View {
    let current: String
    let recent: [String]
    let choose: (String) -> Void
    let cancel: () -> Void
    @State private var text = ""
    @State private var invalid = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(L("server.placeholder"), text: $text)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .onSubmit(connect)
                        .accessibilityLabel(L("server.title"))
                } footer: {
                    if invalid {
                        Text(L("server.invalid")).foregroundStyle(Theme.danger)
                    } else {
                        Text(L("server.hint"))
                    }
                }
                let others = recent.filter { $0 != current }
                if !others.isEmpty {
                    Section(L("server.recent")) {
                        ForEach(others, id: \.self) { origin in
                            Button(Shell.host(of: origin)) { choose(origin) }
                        }
                    }
                }
                Section {
                    Button(L("server.default")) { choose(Shell.defaultServer) }
                }
            }
            .navigationTitle(L("server.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(L("cancel"), action: cancel) }
                ToolbarItem(placement: .confirmationAction) { Button(L("server.connect"), action: connect) }
            }
        }
        .tint(Theme.teal)
        .preferredColorScheme(.dark)
        .onAppear { text = current }
    }

    private func connect() {
        guard let origin = Origins.normalize(text, debug: Shell.debug) else {
            invalid = true
            return
        }
        choose(origin)
    }
}
/// What the TV and the app switcher see while LTW DM is away: the GPT key art and emblem, no page.
struct PrivacyCover: View {
    var body: some View {
        ZStack {
            Color.clear
                .overlay(Image(uiImage: Theme.keyArt).resizable().scaledToFill())
                .clipped()
            Theme.inkDeep.opacity(0.7)
            Image(uiImage: Theme.emblem)
                .resizable()
                .scaledToFit()
                .frame(width: 120, height: 120)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
#endif
