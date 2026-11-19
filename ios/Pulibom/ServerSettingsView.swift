import SwiftUI

enum ServerAddress {
    // "192.168.0.10:3000" 처럼 http:// 없이 넣어도 되게
    static func normalize(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        if !s.isEmpty && !s.contains("://") { s = "http://" + s }
        return s
    }

    static func url(from raw: String) -> URL? {
        let s = normalize(raw)
        guard let url = URL(string: s), url.scheme?.hasPrefix("http") == true, url.host() != nil else { return nil }
        return url
    }
}

// 서버 주소 입력 화면: 처음 켤 때, 연결 실패 화면, 세 손가락 길게 누르기로 연다
struct ServerSettingsView: View {
    @Binding var serverURL: String
    let isFirstRun: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @State private var checking = false
    @State private var result: (ok: Bool, text: String)?

    var body: some View {
        ZStack {
            Color.cream.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("🐣 풀이봄")
                        .font(.largeTitle.bold())
                        .foregroundStyle(Color.ink)
                    Text(isFirstRun ? "선생님이 알려준 풀이봄 서버 주소를 넣어 주세요." : "서버 주소 바꾸기")
                        .foregroundStyle(Color.muted)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("서버 주소").font(.subheadline).foregroundStyle(Color.muted)
                    TextField("192.168.0.10:3000", text: $draft)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.title3.monospaced())
                        .padding(14)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.honey, lineWidth: 1))
                        .onSubmit(save)
                    Text("맥에서 서버를 켠 뒤 '맥 IP 주소:3000'을 넣으면 돼요. (맥: 시스템 설정 → Wi-Fi → 세부사항에서 IP 확인)")
                        .font(.footnote)
                        .foregroundStyle(Color.muted)
                }

                if let result {
                    Text(result.text)
                        .font(.callout)
                        .foregroundStyle(result.ok ? Color.green : Color.red)
                }

                HStack(spacing: 12) {
                    if !isFirstRun {
                        Button("취소") { dismiss() }
                            .buttonStyle(.bordered)
                    }
                    Spacer()
                    Button {
                        Task { await check() }
                    } label: {
                        if checking { ProgressView() } else { Text("연결 확인") }
                    }
                    .buttonStyle(.bordered)
                    .disabled(checking || ServerAddress.url(from: draft) == nil)

                    Button("저장하고 시작", action: save)
                        .buttonStyle(.borderedProminent)
                        .disabled(ServerAddress.url(from: draft) == nil)
                }
                .tint(Color.ink)

                if !isFirstRun {
                    Text("수업 중에는 화면을 세 손가락으로 길게 누르면 이 화면이 열려요.")
                        .font(.footnote)
                        .foregroundStyle(Color.muted)
                }
            }
            .frame(maxWidth: 520)
            .padding(32)
        }
        .onAppear { draft = serverURL }
    }

    private func save() {
        guard ServerAddress.url(from: draft) != nil else { return }
        serverURL = ServerAddress.normalize(draft)
        if !isFirstRun { dismiss() }
    }

    private func check() async {
        guard let base = ServerAddress.url(from: draft) else { return }
        checking = true
        defer { checking = false }
        var req = URLRequest(url: base.appending(path: "login"))
        req.timeoutInterval = 5
        do {
            let (_, res) = try await URLSession.shared.data(for: req)
            let code = (res as? HTTPURLResponse)?.statusCode ?? 0
            result = code < 500 ? (true, "연결됐어요! 저장하고 시작을 눌러 주세요.") : (false, "서버가 응답했지만 오류가 났어요 (\(code)).")
        } catch {
            result = (false, "연결할 수 없어요: \(error.localizedDescription)\n처음이라면 '로컬 네트워크 허용' 팝업에서 허용한 뒤 다시 눌러 주세요.")
        }
    }
}
