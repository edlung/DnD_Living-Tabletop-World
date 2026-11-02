import AppKit
import Foundation
import PDFKit

// Writes each page's lines of a PDF to <out>/page-NNN.jsonl (system PDFKit only): a line's bounds
// in PDF points (origin at the bottom left) and its runs of text, each with its font and size.
// The text layer's own order mixes the columns of the SRD's stat blocks; scripts/srd/text.ts
// puts the lines back in reading order from these bounds.
struct Run: Codable {
  let font: String
  let size: Double
  let text: String
}

struct Line: Codable {
  let x0: Double
  let y0: Double
  let x1: Double
  let y1: Double
  let runs: [Run]
}

let args = CommandLine.arguments
guard args.count == 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("usage: swift pdflines.swift <pdf> <outdir>\n".data(using: .utf8)!)
  exit(1)
}
let out = URL(fileURLWithPath: args[2])
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
let round = { (value: CGFloat) in (Double(value) * 10).rounded() / 10 }

for index in 0..<doc.pageCount {
  guard let page = doc.page(at: index) else { continue }
  var rows: [String] = []
  for line in page.selection(for: page.bounds(for: .mediaBox))?.selectionsByLine() ?? [] {
    guard let attributed = line.attributedString else { continue }
    var runs: [Run] = []
    let whole = attributed.string as NSString
    attributed.enumerateAttribute(.font, in: NSRange(location: 0, length: attributed.length)) {
      value, range, _ in
      let text = whole.substring(with: range).replacingOccurrences(of: "\n", with: " ")
      let font = value as? NSFont
      runs.append(Run(font: font?.fontName ?? "", size: round(font?.pointSize ?? 0), text: text))
    }
    if runs.allSatisfy({ $0.text.trimmingCharacters(in: .whitespaces).isEmpty }) { continue }
    let bounds = line.bounds(for: page)
    let row = Line(
      x0: round(bounds.minX), y0: round(bounds.minY), x1: round(bounds.maxX),
      y1: round(bounds.maxY), runs: runs)
    if let data = try? encoder.encode(row), let json = String(data: data, encoding: .utf8) {
      rows.append(json)
    }
  }
  let name = String(format: "page-%03d.jsonl", index + 1)
  try? (rows.joined(separator: "\n") + "\n").write(
    to: out.appendingPathComponent(name), atomically: true, encoding: .utf8)
}
print("pages: \(doc.pageCount)")
