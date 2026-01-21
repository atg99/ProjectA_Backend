# Inventory API Endpoints

Two new endpoints have been added to manage player inventory.

## 1. Save Inventory State
**Endpoint**: `POST /inventory/save`

**Auth**: Requires JWT Token (header `Authorization: Bearer <token>` or body `token`).

**Request Body**:
```json
{
    "token": "OPTIONAL_IF_IN_HEADER",
    "grid_width": 10,
    "grid_height": 10,
    "saved_entries": [
        {
            "primary_asset_id": "ATGMeleeWeaponData:DA_Melee_Ice",
            "qty": 1,
            "x": 0,
            "y": 0,
            "b_rotated": false
        },
        ...
    ]
}
```

**Response**:
```json
{
    "message": "Inventory saved successfully",
    "inventory_id": 123
}
```

## 2. Load Inventory State
**Endpoint**: `POST /inventory/load`

**Auth**: Requires JWT Token (header `Authorization: Bearer <token>` or body `token`).

**Request Body**:
```json
{
    "token": "OPTIONAL_IF_IN_HEADER"
}
```

**Response**:
```json
{
    "saved_entries": [ ... ],
    "grid_width": 10,
    "grid_height": 10
}
```
If no inventory exists for the user, it returns a default 10x10 empty grid.
