-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_places" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tiktokTitle" TEXT,
    "likes" INTEGER,
    "views" INTEGER,
    "userName" TEXT,
    "tags" TEXT,
    "url" TEXT,
    "place" TEXT,
    "title" TEXT,
    "explanation" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "address" TEXT,
    "photo_name" TEXT,
    "scale" INTEGER
);
INSERT INTO "new_places" ("address", "explanation", "id", "latitude", "likes", "longitude", "photo_name", "scale", "tags", "title", "url", "views") SELECT "address", "explanation", "id", "latitude", "likes", "longitude", "photo_name", "scale", "tags", "title", "url", "views" FROM "places";
DROP TABLE "places";
ALTER TABLE "new_places" RENAME TO "places";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
