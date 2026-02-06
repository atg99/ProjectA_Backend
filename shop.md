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

## 2. Trade Items (통합 거래: 판매 & 구매)

아이템 **판매**와 **구매**를 하나의 요청(Transaction)으로 처리합니다.
판매한 금액과 구매한 금액의 차액(`Net Cost`)만큼 골드가 차감(혹은 지급)됩니다.
구매한 아이템은 **창고(Stash)**로 자동으로 들어갑니다.

> [!IMPORTANT]
> **거래 실패 조건 (전체 롤백)**:
> 1. 골드가 부족한 경우
> 2. **창고에 공간이 부족한 경우 (구매 아이템 배치 불가)**
> 3. 판매하려는 아이템 소유권이 없거나 수량이 부족한 경우

- **Endpoint**: `POST /trade`
- **Authentication**: Required (JWT Token)

### Request Body (JSON)
`sell_items`와 `buy_items` 중 하나 이상은 반드시 포함되어야 합니다.

```json
{
  "sell_items": [
    {
      "source_type": "inventory", // "inventory" | "stash"
      "item_entry_id": 101,       // DB PK (inventory_items.item_entry_id)
      "qty": 5
    },
    {
      "source_type": "stash",
      "item_entry_id": 55,
      "qty": 1
    }
  ],
  "buy_items": [
    {
      "primary_asset_id": "Potion_HP_01",
      "qty": 10
    },
    {
      "primary_asset_id": "LongSword_01",
      "qty": 1
    }
  ]
}
```

### Stash Placement Logic (자동 배치)
- 구매한 아이템은 **AABB (Axis-Aligned Bounding Box)** 충돌 검사를 통해 창고의 빈 공간(왼쪽 상단부터 우선)에 자동으로 배치됩니다.
- `ItemData`에 설정된 `MaxStack`을 초과하는 수량은 자동으로 분할되어 빈 공간을 찾아 배치됩니다. (예: MaxStack=3인 아이템 10개 구매 -> 3, 3, 3, 1개로 나뉘어 배치)
- **공간 부족 시**: 모든 거래가 취소(Rollback)되고 에러가 반환됩니다.

### Response (Success 200)
```json
{
  "message": "Trade successful",
  "earned_gold": 1500,  // 총 판매 금액
  "spent_gold": 500,    // 총 구매 금액
  "current_gold": 2000, // 최종 보유 골드
  "bought_items": [     // (옵션) 구매 성공 내역
    { "primary_asset_id": "Potion_HP_01", "qty": 10 },
    { "primary_asset_id": "LongSword_01", "qty": 1 }
  ]
}
```
---
