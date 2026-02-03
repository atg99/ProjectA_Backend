import fs from 'fs';
import path from 'path';

export interface ItemDefinition {
    primaryAssetId: string;
    width: number;
    height: number;
    maxStack: number;
    sellPrice: number;
}

class ItemDataManager {
    private items: Map<string, ItemDefinition> = new Map();
    private initialized = false;

    /**
     * Load item definitions from CSV file.
     * Expected CSV headers must include: PrimaryAssetId, Width, Height
     */
    public loadData(filePath: string) {
        try {
            if (!fs.existsSync(filePath)) {
                console.warn(`[ItemDataManager] Data file not found at: ${filePath}. Defaults (1x1) will be used.`);
                return;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split(/\r?\n/);

            if (lines.length < 2) return;

            // Header parsing
            const headers = lines[0].split(',').map(h => h.trim());

            // Map column names to indices
            const colMap = new Map<string, number>();
            headers.forEach((h, i) => colMap.set(h, i));

            const idxId = colMap.get('PrimaryAssetId');
            const idxW = colMap.get('Width');
            const idxH = colMap.get('Height');
            const idxStack = colMap.get('MaxStack');
            const idxPrice = colMap.get('sell_price'); // Defined in CSV as sell_price

            if (idxId === undefined || idxW === undefined || idxH === undefined) {
                console.error('[ItemDataManager] CSV missing required columns (PrimaryAssetId, Width, Height)');
                return;
            }

            let loadedCount = 0;
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Handle simple CSV splitting (naive implementation, assumes no commas in values)
                const cols = line.split(',');

                const rawId = cols[idxId];
                if (!rawId) continue;

                const primaryId = rawId.trim();
                const width = parseInt(cols[idxW]) || 1;
                const height = parseInt(cols[idxH]) || 1;
                const maxStack = idxStack !== undefined ? (parseInt(cols[idxStack]) || 1) : 99;
                const sellPrice = idxPrice !== undefined ? (parseInt(cols[idxPrice]) || 0) : 0;

                this.items.set(primaryId, {
                    primaryAssetId: primaryId,
                    width,
                    height,
                    maxStack,
                    sellPrice
                });
                loadedCount++;
            }

            console.log(`[ItemDataManager] Successfully loaded ${loadedCount} items.`);
            this.initialized = true;

        } catch (e) {
            console.error('[ItemDataManager] Failed to load data:', e);
        }
    }

    public getItemSize(primaryId: string, rotated: boolean): { width: number, height: number } {
        const item = this.items.get(primaryId);
        if (!item) {
            // If unknown, assume 1x1
            return { width: 1, height: 1 };
        }
        return rotated
            ? { width: item.height, height: item.width }
            : { width: item.width, height: item.height };
    }

    public getItem(primaryId: string): ItemDefinition | undefined {
        return this.items.get(primaryId);
    }
}

export const itemDataManager = new ItemDataManager();
