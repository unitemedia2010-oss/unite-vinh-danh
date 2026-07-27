package vn.unite.vinhdanh.tv.data

import vn.unite.vinhdanh.tv.BuildConfig

object MockReleaseFactory {
    const val BRANCH_ID = "pilot-tbt"
    const val BRANCH_ADDRESS = "125 Trần Bình Trọng"
    const val CN09_ADDRESS = "683 Âu Cơ Tân Phú"

    fun create(): ReleaseManifest {
        val entries = listOf(
            RecognitionEntry(1, "NV001", "Nguyễn Minh Anh", "Leader · Phượng Hoàng", 156_000_000),
            RecognitionEntry(2, "NV002", "Trần Quốc Bảo", "Leader · Phượng Hoàng", 142_500_000),
            RecognitionEntry(3, "NV003", "Lê Hoàng My", "Leader · Phượng Hoàng", 128_000_000),
            RecognitionEntry(4, "NV004", "Phạm Gia Hân", "Sale Full-time", 97_600_000),
            RecognitionEntry(5, "NV005", "Võ Đức Thịnh", "Sale Full-time", 91_200_000),
            RecognitionEntry(6, "NV006", "Đặng Thanh Hà", "Sale Full-time", 86_750_000),
            RecognitionEntry(7, "NV007", "Bùi Minh Khang", "Sale Part-time", 79_300_000),
            RecognitionEntry(8, "NV008", "Ngô Yến Nhi", "Sale Part-time", 72_100_000),
            RecognitionEntry(9, "NV009", "Đỗ Anh Tuấn", "Sale Full-time", 68_000_000),
            RecognitionEntry(10, "NV010", "Huỳnh Khánh Linh", "Sale Part-time", 63_450_000)
        )

        return ReleaseManifest(
            id = "release-demo-2026-07",
            version = "2026.07-demo.1",
            branchId = BRANCH_ID,
            branchAddress = BRANCH_ADDRESS,
            effectiveAtEpochMs = 0L,
            playlist = listOf(
                PlaylistItem(
                    id = "leader-recognition",
                    type = PlaylistItemType.RECOGNITION,
                    title = "Bảng Vinh Danh Leader",
                    durationSeconds = 22,
                    recognitionBoard = RecognitionBoard(
                        periodLabel = "Kỳ doanh số tháng 07/2026",
                        categoryLabel = "PHƯỢNG HOÀNG · 100–199 TRIỆU",
                        entries = entries
                    )
                ),
                PlaylistItem(
                    id = "internal-video",
                    type = PlaylistItemType.VIDEO,
                    title = "Video truyền thông nội bộ",
                    durationSeconds = 28,
                    mediaUrl = BuildConfig.DEMO_VIDEO_URL.takeIf(String::isNotBlank)
                ),
                PlaylistItem(
                    id = "important-announcement",
                    type = PlaylistItemType.ANNOUNCEMENT,
                    title = "THÔNG BÁO QUAN TRỌNG",
                    durationSeconds = 14,
                    announcementBody = "Họp toàn chi nhánh lúc 08:30 thứ Hai\nVui lòng có mặt trước 10 phút."
                )
            )
        )
    }
}
