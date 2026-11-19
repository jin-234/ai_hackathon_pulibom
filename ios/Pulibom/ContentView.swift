import SwiftUI

struct ContentView: View {
    // 풀이봄 웹 서버 주소 (예: http://192.168.0.10:3000). 처음 켤 때 입력받는다.
    @AppStorage("serverURL") private var serverURL = ""
    @State private var showSettings = false
    @State private var loadError: String?
    @State private var reloadToken = 0
    // 앱을 켤 때마다 로그인부터 (nil = 로그인 화면)
    @State private var student: LoggedInStudent?
    // 시작 화면 (켤 때 한 번). 병아리가 로그인 화면 자리로 이어서 날아가도록 같은 이름공간을 쓴다
    @State private var splash = true
    @Namespace private var logo

    var body: some View {
        ZStack {
            Color.cream.ignoresSafeArea()

            if let url = ServerAddress.url(from: serverURL), student == nil {
                LoginView(
                    server: url,
                    onLogin: { s in withAnimation(.easeInOut(duration: 0.35)) { student = s } },
                    onOpenSettings: { showSettings = true },
                    logo: logo,
                    splashing: splash
                )
                .id(serverURL)
                .transition(.opacity.combined(with: .scale(scale: 0.97)))
            } else if let url = ServerAddress.url(from: serverURL), let student {
                StudentShellView(
                    url: url,
                    student: student,
                    reloadToken: reloadToken,
                    onLoaded: { loadError = nil },
                    onError: { loadError = $0 },
                    onLoggedOut: { withAnimation(.easeInOut(duration: 0.35)) { self.student = nil } },
                    onOpenSettings: { showSettings = true }
                )
                .id(serverURL)
                .transition(.opacity.combined(with: .move(edge: .trailing)))

                if let loadError {
                    ConnectionErrorView(
                        address: serverURL,
                        message: loadError,
                        onRetry: {
                            self.loadError = nil
                            reloadToken += 1
                        },
                        onChangeServer: { showSettings = true }
                    )
                }
            } else {
                ServerSettingsView(serverURL: $serverURL, isFirstRun: true)
            }

            if splash {
                // 병아리가 두 번 뛰고 나면 로그인 화면으로 (병아리는 그대로 로그인 화면 자리로 날아감)
                SplashView(logo: logo) {
                    withAnimation(.spring(response: 0.75, dampingFraction: 0.82)) { splash = false }
                }
                .transition(.opacity)
                .zIndex(1)
            }
        }
        .sheet(isPresented: $showSettings) {
            ServerSettingsView(serverURL: $serverURL, isFirstRun: false)
        }
        .onChange(of: serverURL) {
            loadError = nil
            student = nil
        }
        .onAppear {
            // 수업 중에 화면이 꺼지지 않게
            UIApplication.shared.isIdleTimerDisabled = true
        }
    }
}

struct ConnectionErrorView: View {
    let address: String
    let message: String
    let onRetry: () -> Void
    let onChangeServer: () -> Void

    var body: some View {
        ZStack {
            Color.cream.ignoresSafeArea()
            VStack(spacing: 16) {
                Text("🐣").font(.system(size: 64))
                Text("풀이봄 서버에 연결할 수 없어요")
                    .font(.title2.bold())
                    .foregroundStyle(Color.ink)
                Text(address)
                    .font(.callout.monospaced())
                    .foregroundStyle(Color.muted)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(Color.muted)
                    .multilineTextAlignment(.center)
                Text("맥과 아이패드가 같은 와이파이에 있는지, 맥에서 서버(npm run dev)가 켜져 있는지 확인해 주세요.")
                    .font(.footnote)
                    .foregroundStyle(Color.muted)
                    .multilineTextAlignment(.center)
                HStack(spacing: 12) {
                    Button("서버 주소 바꾸기", action: onChangeServer)
                        .buttonStyle(.bordered)
                    Button("다시 시도", action: onRetry)
                        .buttonStyle(.borderedProminent)
                }
                .tint(Color.ink)
                .padding(.top, 8)
            }
            .frame(maxWidth: 440)
            .padding(32)
        }
    }
}
