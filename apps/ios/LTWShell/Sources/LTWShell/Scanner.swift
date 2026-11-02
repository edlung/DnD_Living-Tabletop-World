#if os(iOS)
@preconcurrency import AVFoundation
import UIKit

/// The QR scanner (docs/adr/0070-native-apps.md §4): the page may not use the camera, so the shell
/// reads the table's code itself (AVFoundation, nothing leaves the device) and hands the text back;
/// whoever asked decides what it is. The text is never logged.
final class ScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onResult: (String?) -> Void = { _ in }

    private let session = AVCaptureSession()
    private let hint = UILabel()
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0x05 / 255, green: 0x09 / 255, blue: 0x0E / 255, alpha: 1)
        layOut()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            startCamera()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                Task { @MainActor in
                    if granted { self?.startCamera() } else { self?.refuse() }
                }
            }
        default:
            refuse()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        let session = session
        DispatchQueue.global(qos: .userInitiated).async { session.stopRunning() }
    }

    private func startCamera() {
        guard let device = AVCaptureDevice.default(for: .video),
            let input = try? AVCaptureDeviceInput(device: device),
            session.canAddInput(input)
        else { return refuse() }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return refuse() }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.insertSublayer(preview, at: 0)
        let session = session
        DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }
    }

    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        let text = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue
        MainActor.assumeIsolated {
            guard let text, !finished else { return }
            finished = true
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            dismiss(animated: true) { [onResult] in onResult(text) }
        }
    }

    private func refuse() {
        hint.text = L("scan.camera")
    }

    @objc private func close() {
        dismiss(animated: true) { [onResult] in onResult(nil) }
    }

    private func layOut() {
        let frame = UIView()
        frame.layer.borderColor = UIColor(red: 0xE6 / 255, green: 0xC7 / 255, blue: 0x84 / 255, alpha: 1).cgColor
        frame.layer.borderWidth = 2
        frame.layer.cornerRadius = 12
        frame.isAccessibilityElement = false
        let panel = UIStackView()
        panel.axis = .vertical
        panel.spacing = 12
        panel.isLayoutMarginsRelativeArrangement = true
        panel.directionalLayoutMargins = .init(top: 16, leading: 16, bottom: 16, trailing: 16)
        panel.backgroundColor = UIColor(red: 0x0B / 255, green: 0x10 / 255, blue: 0x17 / 255, alpha: 0.88)
        panel.layer.cornerRadius = 10
        hint.text = L("scan.hint")
        hint.textColor = UIColor(red: 0xEC / 255, green: 0xE6 / 255, blue: 0xDA / 255, alpha: 1)
        hint.font = .preferredFont(forTextStyle: .body)
        hint.adjustsFontForContentSizeCategory = true
        hint.numberOfLines = 0
        hint.textAlignment = .center
        var look = UIButton.Configuration.bordered()
        look.title = L("close")
        look.baseForegroundColor = hint.textColor
        let close = UIButton(configuration: look, primaryAction: UIAction { [weak self] _ in self?.close() })
        close.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        panel.addArrangedSubview(hint)
        panel.addArrangedSubview(close)
        for item in [frame, panel] as [UIView] {
            item.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(item)
        }
        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            frame.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frame.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            frame.widthAnchor.constraint(equalToConstant: 240),
            frame.heightAnchor.constraint(equalToConstant: 240),
            panel.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            panel.leadingAnchor.constraint(greaterThanOrEqualTo: guide.leadingAnchor, constant: 24),
            panel.widthAnchor.constraint(lessThanOrEqualToConstant: 496),
            panel.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -24),
        ])
        // As wide as the screen allows, up to the sign-in panel's width.
        let wide = panel.widthAnchor.constraint(equalTo: guide.widthAnchor, constant: -48)
        wide.priority = .defaultHigh
        wide.isActive = true
    }
}
#endif
