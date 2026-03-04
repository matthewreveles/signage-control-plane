-- CreateEnum
CREATE TYPE "PlaylistItemKind" AS ENUM ('ASSET', 'COLLECTION_WIDGET');

-- CreateEnum
CREATE TYPE "WidgetRenderMode" AS ENUM ('TICKER', 'LIST', 'GRID');

-- AlterTable
ALTER TABLE "PlaylistItem" ADD COLUMN     "collectionId" TEXT,
ADD COLUMN     "kind" "PlaylistItemKind" NOT NULL DEFAULT 'ASSET',
ADD COLUMN     "queryJson" JSONB,
ADD COLUMN     "renderMode" "WidgetRenderMode",
ALTER COLUMN "assetId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "PlaylistItem_collectionId_idx" ON "PlaylistItem"("collectionId");

-- CreateIndex
CREATE INDEX "PlaylistItem_assetId_idx" ON "PlaylistItem"("assetId");

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ContentCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
