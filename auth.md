# Auth API Documentation

Base URL: `/api/v1/auth`

---

## 1. Register (회원가입)

새로운 사용자를 등록합니다.

- **Endpoint**: `POST /register`
- **Authentication**: None

### Request Body (JSON)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `username` | String | Yes | 사용자 아이디 |
| `password` | String | Yes | 비밀번호 |

### Response (Success 201)
```json
{
  "message": "User registered successfully"
}
```

### Error Responses
- `400`: 필수 파라미터 누락
- `409`: 이미 존재하는 사용자 아이디
- `500`: 서버 내부 오류

---

## 2. Login (로그인)

사용자 아이디와 비밀번호로 로그인하여 JWT 토큰을 발급받습니다.

- **Endpoint**: `POST /login`
- **Authentication**: None

### Request Body (JSON)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `username` | String | Yes | 사용자 아이디 |
| `password` | String | Yes | 비밀번호 |

### Response (Success 200)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Error Responses
- `400`: 필수 파라미터 누락
- `401`: 아이디 또는 비밀번호 불일치
- `500`: 서버 내부 오류

---

## 3. Verify Token (토큰 검증)

발급받은 JWT 토큰의 유효성을 검증하고 사용자 정보를 반환합니다.

- **Endpoint**: `POST /verify`
- **Authentication**: None (토큰은 Body에 포함)

### Request Body (JSON)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `token` | String | Yes | 검증할 JWT 토큰 |

### Response (Success 200)
```json
{
  "uid": 123,
  "username": "PlayerOne"
}
```

### Error Responses
- `400`: 토큰 누락
- `401`: 유효하지 않거나 만료된 토큰

---

## 4. Get User Profile (프로필 조회)

현재 로그인한 사용자의 상세 프로필 정보(골드, 레벨, 경험치 등)를 조회합니다.

- **Endpoint**: `GET /profile`
- **Authentication**: Required (JWT Token in Header or Query or Body)

### Request Parameters
- **Header**: `Authorization: Bearer <TOKEN>`
- **Query**: `?token=<TOKEN>` (Optional fallback)
- **Body**: `{ "token": "<TOKEN>" }` (Optional fallback, not recommended for GET)

### Response (Success 200)
```json
{
  "username": "PlayerOne",
  "level": 5,
  "exp": 1200,
  "gold": 5000,
  "last_pos_x": 100.5,
  "last_pos_y": 200.0,
  "last_pos_z": 50.0
}
```

### Error Responses
- `401`: 인증 실패 (토큰 없음 또는 유효하지 않음)
- `404`: 사용자 프로필을 찾을 수 없음
- `500`: 서버 내부 오류

---
