-- CreateTable
CREATE TABLE "places" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT,
    "likes" INTEGER,
    "views" INTEGER,
    "user_name" TEXT,
    "tags" TEXT,
    "url" TEXT,
    "address" TEXT,
    "explanation" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "photo_name" TEXT,
    "scale" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT (datetime('now')),
    "updated_at" DATETIME NOT NULL DEFAULT (datetime('now'))
);