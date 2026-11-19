import Foundation
import WebKit

struct Student: Decodable, Identifiable, Hashable {
    let id: String
    let number: Int?
    let name: String
    let classId: String
    let className: String
}

struct ChatMessage: Decodable, Identifiable, Equatable {
    let id: Int
    let sender: String // "student" | "teacher"
    let senderName: String
    let body: String
    let createdAt: Double
    let readAt: Double?
    // 선생님이 붙인 학습 자료 (유튜브·웹 링크, 파일). 예전 서버 응답에는 없을 수 있어 옵셔널
    let attachments: [ChatAttachment]?
    var mine: Bool { sender == "student" }
}

// 메시지 첨부 (app/src/lib/messages.ts 의 Attachment)
//  link: url 은 전체 주소, youtubeId 가 있으면 유튜브 영상
//  file: url 은 '/api/message-files/<id>?t=<token>' (서버 주소 기준. 로그인 없이 Safari 로 열린다)
struct ChatAttachment: Decodable, Equatable, Hashable {
    let kind: String // "link" | "file"
    let url: String
    let youtubeId: String?
    let name: String?
    let size: Int?
}

struct LoggedInStudent: Equatable {
    let id: String
    let name: String
}

struct PulibomError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// 풀이봄 웹 API 호출 (app/src/app/api)
enum PulibomAPI {
    // 쿠키는 웹뷰 쪽 저장소에만 둔다
    private static let session = URLSession(configuration: .ephemeral)

    static func roster(_ base: URL) async throws -> [Student] {
        struct Body: Decodable { let students: [Student]?; let error: String? }
        var req = URLRequest(url: base.appending(path: "api/roster"))
        req.timeoutInterval = 8
        let (data, res) = try await session.data(for: req)
        let body = try? JSONDecoder().decode(Body.self, from: data)
        guard (res as? HTTPURLResponse)?.statusCode == 200, let students = body?.students else {
            throw PulibomError(message: body?.error ?? "학생 명단을 불러오지 못했어요.")
        }
        return students
    }

    // 로그인 성공 시 받은 세션 쿠키를 웹뷰에 넣어서, 웹 화면이 같은 학생으로 열리게 한다
    @MainActor
    static func login(_ base: URL, studentId: String?, password: String, skip: Bool = false) async throws -> LoggedInStudent {
        struct Body: Decodable {
            struct Session: Decodable { let id: String; let name: String }
            let session: Session?
            let error: String?
        }
        let url = base.appending(path: "api/auth/login")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 8
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var payload: [String: Any] = ["role": "student", "password": password, "skip": skip]
        if let studentId { payload["id"] = studentId }
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, res) = try await session.data(for: req)
        let body = try? JSONDecoder().decode(Body.self, from: data)
        guard let http = res as? HTTPURLResponse, http.statusCode == 200, let s = body?.session else {
            throw PulibomError(message: body?.error ?? "로그인에 실패했어요.")
        }
        await keepCookies(from: http, url: url)
        return LoggedInStudent(id: s.id, name: s.name)
    }

    // 반 코드 확인: 어느 반인지 이름을 돌려준다 (app/src/app/api/auth/signup)
    static func joinClassName(_ base: URL, code: String) async throws -> String {
        struct Body: Decodable { let className: String?; let error: String? }
        var comps = URLComponents(url: base.appending(path: "api/auth/signup"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "code", value: code)]
        var req = URLRequest(url: comps.url!)
        req.timeoutInterval = 8
        let (data, _) = try await session.data(for: req)
        let body = try? JSONDecoder().decode(Body.self, from: data)
        guard let name = body?.className else { throw PulibomError(message: body?.error ?? "반 코드를 확인하지 못했어요.") }
        return name
    }

    // 학생 회원가입 → 그 반 학생으로 바로 로그인
    @MainActor
    static func signup(_ base: URL, code: String, number: Int, name: String, password: String) async throws -> LoggedInStudent {
        struct Body: Decodable {
            struct Session: Decodable { let id: String; let name: String }
            let session: Session?
            let error: String?
        }
        let url = base.appending(path: "api/auth/signup")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 8
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["code": code, "number": number, "name": name, "password": password])

        let (data, res) = try await session.data(for: req)
        let body = try? JSONDecoder().decode(Body.self, from: data)
        guard let http = res as? HTTPURLResponse, http.statusCode == 200, let s = body?.session else {
            throw PulibomError(message: body?.error ?? "가입하지 못했어요.")
        }
        await keepCookies(from: http, url: url)
        return LoggedInStudent(id: s.id, name: s.name)
    }

    // MARK: 선생님과 메시지 (app/src/app/api/messages)

    // 로그인한 학생으로 부르기: 웹뷰에 있는 로그인 쿠키를 같이 보낸다
    @MainActor
    private static func authed(_ url: URL) async -> URLRequest {
        var req = URLRequest(url: url)
        req.timeoutInterval = 8
        req.httpShouldHandleCookies = false
        let host = url.host() ?? ""
        let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies()
            .filter { host == $0.domain || host.hasSuffix("." + $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) }
        for (k, v) in HTTPCookie.requestHeaderFields(with: cookies) { req.setValue(v, forHTTPHeaderField: k) }
        return req
    }

    private struct ErrorBody: Decodable { let error: String? }

    private static func decode<T: Decodable>(_ type: T.Type, _ data: Data, _ res: URLResponse, fallback: String) throws -> T {
        guard (res as? HTTPURLResponse)?.statusCode == 200 else {
            throw PulibomError(message: (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? fallback)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    @MainActor
    static func unreadMessages(_ base: URL) async throws -> Int {
        struct Body: Decodable { let unread: Int }
        var comps = URLComponents(url: base.appending(path: "api/messages"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "unread", value: "1")]
        let (data, res) = try await session.data(for: await authed(comps.url!))
        return try decode(Body.self, data, res, fallback: "메시지를 확인하지 못했어요.").unread
    }

    // 대화 불러오기 (선생님 메시지는 읽음으로)
    @MainActor
    static func messages(_ base: URL) async throws -> [ChatMessage] {
        struct Body: Decodable { let messages: [ChatMessage] }
        let (data, res) = try await session.data(for: await authed(base.appending(path: "api/messages")))
        return try decode(Body.self, data, res, fallback: "메시지를 불러오지 못했어요.").messages
    }

    @MainActor
    static func sendMessage(_ base: URL, body: String) async throws -> ChatMessage {
        struct Body: Decodable { let message: ChatMessage }
        var req = await authed(base.appending(path: "api/messages"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["body": body])
        let (data, res) = try await session.data(for: req)
        return try decode(Body.self, data, res, fallback: "보내지 못했어요.").message
    }

    // 응답의 세션 쿠키를 웹뷰 쿠키 저장소로
    @MainActor
    private static func keepCookies(from http: HTTPURLResponse, url: URL) async {
        let headers = http.allHeaderFields.reduce(into: [String: String]()) { out, kv in
            if let k = kv.key as? String, let v = kv.value as? String { out[k] = v }
        }
        let store = WKWebsiteDataStore.default().httpCookieStore
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: headers, for: url) {
            await store.setCookie(cookie)
        }
    }

    // 앱을 켤 때·로그아웃할 때 이전 학생의 로그인 흔적 지우기
    @MainActor
    static func clearLogin() async {
        let store = WKWebsiteDataStore.default().httpCookieStore
        for cookie in await store.allCookies() {
            await store.deleteCookie(cookie)
        }
    }
}
