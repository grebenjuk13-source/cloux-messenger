import AppKit
import SwiftUI
import WebKit

private let clouxHost = "cloux-messenger.onrender.com"
private let clouxURL = URL(string: "https://cloux-messenger.onrender.com/v5/")!

@main
struct ClouxMacApp: App {
    var body: some Scene {
        WindowGroup {
            ClouxWindow()
                .frame(minWidth: 760, minHeight: 560)
                .preferredColorScheme(.dark)
        }
        .windowStyle(.hiddenTitleBar)
    }
}

@MainActor
final class BrowserState: ObservableObject {
    @Published var canGoBack = false
    @Published var canGoForward = false
    weak var webView: WKWebView?

    func refreshNavigation() {
        canGoBack = webView?.canGoBack ?? false
        canGoForward = webView?.canGoForward ?? false
    }
    func back() { webView?.goBack() }
    func forward() { webView?.goForward() }
    func reload() { webView?.reload() }
}

struct ClouxWindow: View {
    @StateObject private var browser = BrowserState()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Image(nsImage: NSImage(named: NSImage.applicationIconName) ?? NSImage())
                    .resizable().frame(width: 24, height: 24).clipShape(RoundedRectangle(cornerRadius: 7))
                Text("Cloux").font(.system(size: 15, weight: .bold))
                Spacer()
                Button(action: browser.back) { Image(systemName: "chevron.left") }
                    .disabled(!browser.canGoBack).help("Назад")
                Button(action: browser.forward) { Image(systemName: "chevron.right") }
                    .disabled(!browser.canGoForward).help("Вперед")
                Button(action: browser.reload) { Image(systemName: "arrow.clockwise") }.help("Оновити")
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 18).padding(.vertical, 12)
            .background(Color(red: 0.055, green: 0.045, blue: 0.06))
            ClouxWebView(state: browser)
        }
        .background(Color.black)
        .preferredColorScheme(.dark)
    }
}

struct ClouxWebView: NSViewRepresentable {
    @ObservedObject var state: BrowserState

    func makeCoordinator() -> Coordinator { Coordinator(state: state) }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        state.webView = webView
        webView.load(URLRequest(url: clouxURL))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let state: BrowserState
        init(state: BrowserState) { self.state = state }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            state.refreshNavigation()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            state.refreshNavigation()
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "https", url.host?.lowercased() == clouxHost {
                if action.targetFrame == nil {
                    webView.load(action.request)
                    decisionHandler(.cancel)
                } else {
                    decisionHandler(.allow)
                }
                return
            }
            if url.scheme == "https" || url.scheme == "http" {
                NSWorkspace.shared.open(url)
            }
            decisionHandler(.cancel)
        }

        @available(macOS 12.0, *)
        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(origin.host.lowercased() == clouxHost ? .prompt : .deny)
        }
    }
}
