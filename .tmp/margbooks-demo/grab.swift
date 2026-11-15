import Foundation
import AVFoundation
import AppKit
import CoreGraphics

let args = CommandLine.arguments
guard args.count >= 3 else {
  fputs("usage: grab <video> <outdir>\n", stderr); exit(1)
}
let url = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let asset = AVAsset(url: url)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.maximumSize = CGSize(width: 1280, height: 720)
let duration = CMTimeGetSeconds(asset.duration)
let stamps: [Double] = duration.isFinite && duration > 0
  ? [0.5, duration * 0.33, duration * 0.66, max(0.5, duration - 0.5)]
  : [0.5]
let name = url.deletingPathExtension().lastPathComponent
  .replacingOccurrences(of: " ", with: "_")
for (i, t) in stamps.enumerated() {
  let time = CMTime(seconds: t, preferredTimescale: 600)
  do {
    let cg = try gen.copyCGImage(at: time, actualTime: nil)
    let rep = NSBitmapImageRep(cgImage: cg)
    guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.75]) else { continue }
    let dest = outDir.appendingPathComponent("\(name)_\(i).jpg")
    try data.write(to: dest)
    print("wrote \(dest.path)")
  } catch {
    fputs("frame \(i) failed: \(error)\n", stderr)
  }
}
