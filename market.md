# Market API Documentation

Base URL: `/api/v1/market`

---

## 1. Get Listings (매물 목록 조회)

시장에 등록된 활성 매물(`status = 0`)들을 조회합니다.

- **Endpoint**: `GET /listings`
- **Authentication**: Optional (Not required for viewing)

### Request Parameters (Query)
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | Integer | No | `1` | 페이지 번호 |
| `limit` | Integer | No | `20` | 페이지 당 항목 수 |
| `sort` | String | No | `'latest'` | 정렬 기준 (`latest`, `price_asc`, `price_desc`) |
| `keyword` | String | No | - | 아이템 ID (`primary_asset_id`) 검색어 |

### Response (Success 200)
```json
{
  "data": [
    {
      "listing_id": 101,
      "seller_uid": 12,
      "seller_name": "PlayerOne",
      "primary_asset_id": "sword_01",
      "qty": 1,
      "price": 1000,
      "status": 0,
      "item_metadata": { "rotated": false },
      "created_at": "2026-01-28T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "total_pages": 3
  }
}
```

---

## 2. Get Listing Detail (매물 상세 조회)

특정 매물의 상세 정보를 조회합니다.

- **Endpoint**: `GET /listings/:id`
- **Authentication**: Optional

### Request Parameters (Path)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | Integer | Yes | 매물 ID (`listing_id`) |

### Response (Success 200)
```json
{
  "listing_id": 101,
  "seller_uid": 12,
  "seller_name": "PlayerOne",
  "primary_asset_id": "sword_01",
  "qty": 1,
  "price": 1000,
  "status": 0,
  "item_metadata": { "rotated": false },
  "created_at": "2026-01-28T10:00:00.000Z"
}
```

---

## 3. Register Listing (판매 등록)

인벤토리의 아이템을 시장에 등록합니다. 아이템은 인벤토리에서 제거됩니다.

- **Endpoint**: `POST /listings`
- **Authentication**: Required (JWT Token)

### Request Body (JSON)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `item_entry_id` | Integer | Yes | 판매할 인벤토리 아이템의 고유 ID (`inventory_items.item_entry_id`) |
| `price` | Integer | Yes | 판매 가격 (개당 가격 아님, 총 가격) |
| `qty` | Integer | Yes | 판매 수량 |

### Response (Success 200)
```json
{
  "message": "Item listed successfully",
  "listing_id": 102
}
```

---

## 4. Purchase Listing (구매하기)

등록된 매물을 구매합니다. 구매자의 골드가 차감되고 아이템은 구매자의 창고(Stash)로 지급됩니다.

- **Endpoint**: `POST /listings/:id/purchase`
- **Authentication**: Required (JWT Token)

### Request Parameters (Path)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | Integer | Yes | 매물 ID (`listing_id`) |

### Response (Success 200)
```json
{
  "message": "Purchase successful"
}
```

---

## 5. Get My Listings (내 판매글 조회)

자신이 등록한 매물 목록을 조회합니다.

- **Endpoint**: `GET /my-listings`
- **Authentication**: Required (JWT Token)

### Request Parameters (Query)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `status` | String | No | 필터 (`active`: 판매중, `sold`: 판매완료, `history`: 전체) |

### Response (Success 200)
```json
[
  {
    "listing_id": 101,
    "seller_uid": 12,
    "primary_asset_id": "sword_01",
    "qty": 1,
    "price": 1000,
    "status": 0,
    "item_metadata": { "rotated": false },
    "created_at": "2026-01-28T10:00:00.000Z",
    "sold_at": null
  }
]
```

---

## 6. Cancel Listing (판매 취소)

판매 중인 매물을 취소합니다. 아이템은 판매자의 창고(Stash)로 회수됩니다.

- **Endpoint**: `POST /listings/:id/cancel`
- **Authentication**: Required (JWT Token)

### Request Parameters (Path)
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | Integer | Yes | 매물 ID (`listing_id`) |

### Response (Success 200)
```json
{
  "message": "Listing cancelled"
}
```

---

## Status Codes
- `200`: Success
- `400`: Bad Request (Invalid parameters, insufficient funds, etc.)
- `401`: Unauthorized (Invalid or missing token)
- `403`: Forbidden (Not owner of the item)
- `404`: Not Found (Item/Listing not found)
- `500`: Internal Server Error
