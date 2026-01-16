# 프로젝트 작업 계획서: 하이브리드 게임 서버

## 0단계: 개발 환경 세팅 (Prerequisites)
이 단계를 건너뛰면 나중에 라이브러리 충돌로 고생합니다.

1.  **기술 스택 확정**
    *   **언어:** Node.js (TypeScript 권장), C++ (Unreal Engine)
    *   **DB:** MySQL 또는 MariaDB (RDBMS)
    *   **통신:** HTTP (Axios/Express), TCP (net/Sockets)
    *   **직렬화:** FlatBuffers (`flatc` 컴파일러 설치 필수)
2.  **프로젝트 구조 생성**
    *   `/Server`: Node.js 프로젝트 폴더
    *   `/Client`: (node.js) 간단한 테스트 클라이언트 코드(`test_client.js`)를 짠다.
    *   `/Schema`: FlatBuffers `.fbs` 파일 모아두는 공용 폴더 (서버/클라 양쪽으로 코드 생성)

---

## 🏗 1단계: REST API 서버 (Express) - 계정 및 인증
**목표:** 테스트클라이언트에서  아이디/비번을 입력하면 DB를 조회해 **'접속 토큰'**을 발급받는다.

### [1-1] DB 설계 및 구축
*   db는 gamedb.sql에 정의되어있다. container는 이미 실행됨
    docker-compose.yml에 정의된 mysql 컨테이너에 연결한다.

### [1-2] Express API 구현
*   [ ] **회원가입 API (`POST /register`):**
    *   비밀번호는 반드시 **sha256**로 암호화해서 저장 (평문 저장 금지).
    *   아이디 중복 체크 로직.
*   [ ] **로그인 API (`POST /login`):**
    *   ID/PW 검증 성공 시 **JWT(JSON Web Token)** 발급.
    *   **중요:** 이 JWT가 나중에 TCP 서버 접속 시 "입장권"이 됩니다.

---

## 🌉 2단계: 프로토콜 정의 (FlatBuffers)
**목표:** C++과 Node.js가 서로 알아들을 수 있는 언어(스키마)를 만든다.

### [2-1] 스키마 파일 (`.fbs`) 작성
*   [ ] **`game.fbs` 정의:**
    *   `PacketType` (Enum): `LOGIN_REQ`, `CHAT_MSG`, `ERROR` 등 패킷 ID 정의.
    *   `LoginPacket`: `token` (String - 아까 받은 JWT).
    *   `ChatPacket`: `sender_id`, `message`, `timestamp`.
    *   `PacketHeader`: 패킷 크기(Size)와 타입(Type)을 포함하는 공통 헤더.

### [2-2] 코드 컴파일 (CodeGen)
*   [ ] `flatc --ts game.fbs` -> Node.js용 생성.
*   [ ] `flatc --cpp game.fbs` -> 언리얼용 헤더 생성.

---

## 🚀 3단계: TCP 채팅 서버 (Node.js `net` 모듈)
**목표:** 실시간 소켓 연결을 받고, 패킷을 뜯어서 처리한다.

### [3-1] TCP 서버 기본 골격
*   [ ] `net.createServer()`로 서버 오픈 (포트 예: 7777).
*   [ ] **세션 관리자(Session Manager) 구현:**
    *   `Map<Socket, UserData>` 형태로 현재 접속자 관리.
    *   소켓이 끊기면 Map에서 제거.

### [3-2] ⚠️ [중요] 패킷 프레이밍 (Packet Framing) 처리
*   **설명:** TCP는 데이터가 뭉쳐서 오거나(Sticky), 쪼개져서 옵니다.
*   [ ] **수신 버퍼(Receive Buffer) 구현:** 들어오는 데이터를 일단 쌓아둠.
*   [ ] **패킷 파싱 로직:**
    1.  헤더 크기(예: 4바이트)만큼 데이터가 모였는가?
    2.  헤더를 읽어서 `BodySize`를 알아냄.
    3.  `BodySize`만큼 데이터가 다 모였는가? -> 다 모였으면 FlatBuffers로 역직렬화.

### [3-3] 인증 및 브로드캐스트
*   [ ] **최초 접속 처리:** 소켓 연결 후 첫 패킷은 무조건 `LoginPacket`이어야 함.
*   [ ] **토큰 검증:** `LoginPacket`의 JWT를 검증하여 유효하지 않으면 소켓 강제 종료 (`socket.destroy()`).
*   [ ] **채팅 구현:** A유저가 `ChatPacket`을 보내면, `Session Manager`에 있는 모든 소켓에게 루프를 돌며 `socket.write()` 전송.

---

## 🎮 4단계: 언리얼 클라이언트 테스트용 node.js
**목표:** HTTP로 로그인하고, 그 정보로 TCP에 접속해 채팅을 주고받는다.

### [4-1] HTTP 통신 (Express 연동)
*   [ ] `axios` 사용하여 `/login` 요청.
*   [ ] 응답받은 JSON에서 `JWT Token` 파싱하여 변수에 저장.

### [4-2] TCP 소켓 연결 (`net`)
*   [ ] `net`으로 소켓 생성 및 Connect.
*   [ ] **연결 직후:** 저장해둔 `JWT Token`을 FlatBuffers로 직렬화하여 서버에 전송.
