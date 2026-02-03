# Shop API Documentation

Base URL: `/api/v1/shop`

---

## 1. Sell Item (시스템에 아이템 판매)

인벤토리 혹은 창고(Stash)에 있는 아이템을 시스템(상점)에 판매합니다.
판매 가격은 `ItemData.csv`의 `sell_price`를 따르며, 판매 즉시 사용자에게 골드가 지급되고 아이템은 소멸됩니다.

- **Endpoint**: `POST /sell`
- **Authentication**: Required (JWT Token)

### Request Body (JSON)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `source_type` | String | Yes | 아이템 위치 (`inventory` 또는 `stash`) |
| `item_entry_id` | Integer | Yes | 판매할 아이템의 고유 ID (`item_entry_id` or `stash_entry_id`) |
| `qty` | Integer | Yes | 판매 수량 |

### Response (Success 200)
```json
{
  "message": "Sold successfully",
  "earned_gold": 500,
  "current_gold": 1500
}
```

### Error Responses
- `400`: 유효하지 않은 요청 (아이템을 찾을 수 없음, 수량 부족, 판매 불가 아이템 등)
- `401`: 인증 실패
- `403`: 소유권 없음
- `404`: 아이템 없음
- `500`: 서버 내부 오류

---
