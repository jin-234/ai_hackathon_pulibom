import SwiftUI
import WebKit

// 풀이봄 웹의 학생 화면을 띄우는 웹뷰
// - User-Agent 끝에 PulibomApp 을 붙여서, 웹이 학생 화면만 보여 주게 한다 (app/src/lib/app.ts)
// - 확대·길게 눌러 선택 막기 (애플펜슬 필기 중 화면이 움직이지 않게)
// - alert / confirm 을 iOS 팝업으로
// - 아래로 당겨 새로고침(화면은 그대로 두고 상단에 병아리 표시), 세 손가락 길게 누르면 서버 주소 설정
// - 확대는 되고(최대 5배) 원래 크기보다 작게는 안 줄어든다
// - 웹에서 로그아웃(또는 세션 만료)해서 /login 으로 가면 앱 로그인 화면으로 돌아간다
// - 웹 상단 바 중 data-app-hide 부분은 숨기고 앱 상단 바(StudentShellView)를 쓴다
final class WebController: ObservableObject {
    weak var webView: WKWebView?
    @Published var path = "/student"
    // 과제 목록 탭 (?tab=todo|done|past). 하단 탭 바와 맞춘다
    @Published var tab = "todo"
    // 웹 문서 제목 = 문제 푸는 화면에선 과제 이름 (상단 바 가운데에 보여 준다)
    @Published var title = ""
    // 당겨서 새로고침: 얼마나 당겼는지(0~1, 1이면 놓을 때 새로고침), 새로고침 중인지
    @Published var pull: CGFloat = 0
    @Published var refreshing = false

    // 웹 안에서 화면만 바꾸는 이동(Next 라우터)으로 → 전체 새로고침보다 빠르고 깜빡임 없음. 안 되면 일반 이동
    func open(_ path: String, tab: String? = nil) {
        let target = path + (tab.map { "?tab=\($0)" } ?? "")
        let js = """
        (function (u) {
          // 웹이 준비되기 전에 Next 라우터를 부르면 오류가 나므로, 준비 표시(__pulibomReady)가 있을 때만
          var r = window.__pulibomReady && window.next && window.next.router;
          if (r && r.push) r.push(u); else location.assign(u);
        })(\(String(reflecting: target)));
        """
        webView?.evaluateJavaScript(js)
    }

    // 과제 목록 탭 바꾸기: 웹이 탭을 미리 다 받아 두었으면 화면에서 바로 넘기고(StudentTabs), 아니면 이동
    func switchTab(_ tab: String) {
        let js = """
        (function (t) {
          if (window.__pulibomTabs) window.dispatchEvent(new CustomEvent('pulibom:tab', { detail: t }));
          else return 'navigate';
        })(\(String(reflecting: tab)));
        """
        webView?.evaluateJavaScript(js) { [weak self] result, _ in
            if (result as? String) == "navigate" { self?.open("/student", tab: tab) }
        }
    }
}

struct StudentWebView: UIViewRepresentable {
    let url: URL
    let controller: WebController
    let reloadToken: Int
    let onLoaded: () -> Void
    let onError: (String) -> Void
    let onLoggedOut: () -> Void
    let onOpenSettings: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = "Mobile/15E148 PulibomApp/1.0"
        config.userContentController.addUserScript(
            WKUserScript(source: Self.hideScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        config.userContentController.addUserScript(
            WKUserScript(source: Self.tabletScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Color.cream)
        webView.scrollView.backgroundColor = UIColor(Color.cream)
        // 스크롤인지 기다리느라 터치를 늦게 넘기면 버튼 눌림이 뒤늦게 툭 나타난다 → 바로 넘기기
        webView.scrollView.delaysContentTouches = false
        Self.limitZoom(webView)
        context.coordinator.offsetObservation = webView.scrollView.observe(\.contentOffset) { [weak coordinator = context.coordinator] sv, _ in
            DispatchQueue.main.async { coordinator?.scrolled(sv) }
        }

        let settingsGesture = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.openSettings(_:)))
        settingsGesture.numberOfTouchesRequired = 3
        settingsGesture.minimumPressDuration = 1.0
        settingsGesture.delegate = context.coordinator
        settingsGesture.cancelsTouchesInView = false // 펜슬로 쓰는 중인 획을 끊지 않게
        webView.addGestureRecognizer(settingsGesture)

        context.coordinator.webView = webView
        controller.webView = webView
        // 웹은 화면 전환을 주소만 바꿔서(pushState) 하므로 이동 이벤트 대신 주소를 지켜본다
        context.coordinator.urlObservation = webView.observe(\.url) { [weak coordinator = context.coordinator] wv, _ in
            guard let path = wv.url?.path() else { return }
            DispatchQueue.main.async {
                guard let parent = coordinator?.parent else { return }
                if path.hasPrefix("/login") { return parent.onLoggedOut() }
                parent.controller.path = path
                StudentWebView.limitZoom(wv)
                if path == "/student" || path == "/student/" {
                    let q = URLComponents(url: wv.url!, resolvingAgainstBaseURL: false)?.queryItems
                    parent.controller.tab = q?.first { $0.name == "tab" }?.value ?? "todo"
                }
                // 문제 푸는 화면에서는 당겨서 새로고침·튕김을 꺼서 펜슬 획이 끊기지 않게
                wv.scrollView.bounces = !path.hasPrefix("/student/")
            }
        }
        context.coordinator.titleObservation = webView.observe(\.title) { [weak coordinator = context.coordinator] wv, _ in
            let t = wv.title ?? ""
            DispatchQueue.main.async { coordinator?.parent.controller.title = t }
        }
        context.coordinator.lastReloadToken = reloadToken
        var start = "student"
        #if DEBUG
        // 개발용: 실행 인자 -startPath /student/과제id 로 바로 그 화면부터
        if let p = UserDefaults.standard.string(forKey: "startPath") { start = String(p.drop { $0 == "/" }) }
        #endif
        webView.load(URLRequest(url: url.appending(path: start)))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.lastReloadToken != reloadToken {
            context.coordinator.lastReloadToken = reloadToken
            if webView.url == nil {
                webView.load(URLRequest(url: url.appending(path: "student")))
            } else {
                webView.reload()
            }
        }
    }

    // 앱 상단 바와 겹치는 웹 요소 숨기기 (그려지기 전에 넣어서 깜빡임 없게)
    // + 터치 리스너가 있어야 iOS 웹뷰가 버튼 :active(눌림 모양)를 바로 보여 준다
    private static let hideScript = """
    (function () {
      var s = document.createElement('style');
      s.textContent = '[data-app-hide]{display:none!important}.app-only{display:inline-flex!important}';
      document.documentElement.appendChild(s);
      document.addEventListener('touchstart', function () {}, { passive: true });
    })();
    """

    // 확대·축소 막기 + 길게 누를 때 뜨는 선택·메뉴 막기 (입력칸은 그대로)
    // 웹이 화면을 바꾸며 viewport 를 다시 써도 곧바로 되돌려서, 어느 화면에서든 원래 크기에서 더 줄어들지 않게
    private static let tabletScript = """
    (function () {
      var FIXED = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, user-scalable=yes';
      var fix = function () {
        var m = document.querySelector('meta[name=viewport]');
        if (!m) { m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
        if (m.content !== FIXED) m.content = FIXED;
      };
      fix();
      new MutationObserver(fix).observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
      var s = document.createElement('style');
      s.textContent = 'html{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}'
        + 'input,textarea,select{-webkit-user-select:auto;user-select:auto}';
      document.head.appendChild(s);
    })();
    """

    // 확대는 최대 5배까지, 원래 크기(1배)보다 작게는 안 되게 (끝에서 튕기지도 않게)
    static func limitZoom(_ webView: WKWebView) {
        let sv = webView.scrollView
        sv.minimumZoomScale = 1
        sv.maximumZoomScale = 5
        sv.bouncesZoom = false
        if sv.zoomScale < 1 { sv.setZoomScale(1, animated: false) }
        sv.pinchGestureRecognizer?.isEnabled = true
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate {
        var parent: StudentWebView
        weak var webView: WKWebView?
        var lastReloadToken = 0
        var urlObservation: NSKeyValueObservation?
        var titleObservation: NSKeyValueObservation?
        var offsetObservation: NSKeyValueObservation?
        private var armed = false
        private static let pullDistance: CGFloat = 90

        init(_ parent: StudentWebView) { self.parent = parent }

        // 당겨서 새로고침: 화면을 밀어 내리는 기본 방식 대신, 당긴 만큼 상단 표시만 보여 주고 놓으면 새로고침
        func scrolled(_ sv: UIScrollView) {
            let c = parent.controller
            guard sv.bounces, !c.refreshing else { return }
            let pulled = max(0, -(sv.contentOffset.y + sv.adjustedContentInset.top))
            let p = min(1, pulled / Self.pullDistance)
            if sv.isDragging {
                if p >= 1, !armed {
                    armed = true
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                } else if p < 1 {
                    armed = false
                }
            } else if armed {
                armed = false
                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) { c.refreshing = true }
                webView?.reload()
            }
            if abs(c.pull - p) > 0.01 || (p == 0 && c.pull != 0) { c.pull = p }
        }

        private func endRefresh() {
            let c = parent.controller
            guard c.refreshing else { return }
            withAnimation(.easeOut(duration: 0.25)) {
                c.refreshing = false
                c.pull = 0
            }
        }

        @objc func openSettings(_ sender: UILongPressGestureRecognizer) {
            if sender.state == .began { parent.onOpenSettings() }
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            true
        }

        // MARK: 이동·오류

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            endRefresh()
            StudentWebView.limitZoom(webView)
            parent.onLoaded()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            fail(webView, error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            fail(webView, error)
        }

        private func fail(_ webView: WKWebView, _ error: Error) {
            endRefresh()
            if (error as NSError).code == NSURLErrorCancelled { return }
            parent.onError(error.localizedDescription)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        // 풀이봄 서버 밖으로 나가는 링크는 사파리로
        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let target = action.request.url, action.targetFrame?.isMainFrame != false else {
                return decisionHandler(.allow)
            }
            let sameServer = target.host() == parent.url.host() && target.port == parent.url.port
            if sameServer || target.scheme == "about" || target.scheme == "blob" || target.scheme == "data" {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(target)
                decisionHandler(.cancel)
            }
        }

        // target="_blank" 링크도 같은 화면에서
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for action: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if action.targetFrame == nil { webView.load(action.request) }
            return nil
        }

        // MARK: alert / confirm

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
            present(alert, from: webView, fallback: completionHandler)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
            present(alert, from: webView, fallback: { completionHandler(false) })
        }

        private func present(_ alert: UIAlertController, from webView: WKWebView, fallback: () -> Void) {
            var top = webView.window?.rootViewController
            while let next = top?.presentedViewController { top = next }
            guard let top else { return fallback() }
            top.present(alert, animated: true)
        }
    }
}
