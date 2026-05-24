import UIKit

/// DevShell launcher view. Mirrors the Android `MainActivity` — a dark
/// flat surface with the brand mark, a subtitle, and a label populated by
/// the shared C++ renderer (round-trip through Obj-C++).
///
/// Real Auto-class work — Metal `MTKView`, native tile pipeline, etc. —
/// hangs off here.
final class ViewController: UIViewController {

    private let renderer = DevShellRenderer()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 7/255, green: 11/255, blue: 20/255, alpha: 1)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24)
        ])

        stack.addArrangedSubview(brandRow())
        stack.setCustomSpacing(24, after: stack.arrangedSubviews.last!)

        stack.addArrangedSubview(label(
            text: "Smart Maps · native sandbox",
            color: UIColor(red: 138/255, green: 147/255, blue: 168/255, alpha: 1),
            size: 11,
            weight: .medium,
            uppercase: true
        ))

        stack.addArrangedSubview(label(
            text: renderer.greeting(),
            color: .white,
            size: 22,
            weight: .regular
        ))

        stack.addArrangedSubview(label(
            text: "renderer v\(renderer.version())",
            color: UIColor(red: 138/255, green: 147/255, blue: 168/255, alpha: 1),
            size: 11,
            weight: .medium,
            uppercase: true
        ))

        renderer.logFromNative("Swift → Obj-C++ → C++ → os_log round-trip alive")
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    // MARK: - layout helpers

    private func brandRow() -> UIView {
        let row = UIStackView()
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = 10

        let dot = UIView()
        dot.backgroundColor = UIColor(red: 0, green: 229/255, blue: 1, alpha: 1)
        dot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            dot.widthAnchor.constraint(equalToConstant: 8),
            dot.heightAnchor.constraint(equalToConstant: 8)
        ])
        row.addArrangedSubview(dot)

        row.addArrangedSubview(label(
            text: "DevShell",
            color: UIColor(red: 0, green: 229/255, blue: 1, alpha: 1),
            size: 14,
            weight: .bold,
            uppercase: true,
            tracking: 0.18
        ))

        return row
    }

    private func label(
        text: String,
        color: UIColor,
        size: CGFloat,
        weight: UIFont.Weight,
        uppercase: Bool = false,
        tracking: CGFloat = 0
    ) -> UILabel {
        let l = UILabel()
        l.text = uppercase ? text.uppercased() : text
        l.textColor = color
        l.font = .systemFont(ofSize: size, weight: weight)
        l.numberOfLines = 0
        if tracking != 0 {
            l.attributedText = NSAttributedString(string: l.text ?? "", attributes: [
                .kern: tracking * size,
                .font: l.font!,
                .foregroundColor: color
            ])
        }
        return l
    }
}
