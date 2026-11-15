import PDFKit
import AppKit
let args = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: args[1]))!
for i in 0..<doc.pageCount {
  let page = doc.page(at: i)!
  let img = page.thumbnail(of: NSSize(width: 600, height: 850), for: .mediaBox)
  let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(args[1])-p\(i+1).png"))
}
print(doc.pageCount)
