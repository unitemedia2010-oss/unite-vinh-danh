package vn.unite.vinhdanh.tv.ui

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import vn.unite.vinhdanh.tv.R
import vn.unite.vinhdanh.tv.data.RecognitionBoard
import vn.unite.vinhdanh.tv.data.RecognitionEntry
import java.util.Locale

class RecognitionRenderer(
    private val context: Context,
    private val topThreeContainer: LinearLayout,
    private val leftColumn: LinearLayout,
    private val rightColumn: LinearLayout
) {
    private val avatarLoader = AvatarImageLoader(context)

    fun prefetchAvatar(url: String?, callback: (Boolean) -> Unit) {
        avatarLoader.prefetch(url, callback)
    }

    fun render(board: RecognitionBoard) {
        topThreeContainer.removeAllViews()
        leftColumn.removeAllViews()
        rightColumn.removeAllViews()

        val byRank = board.entries.associateBy(RecognitionEntry::rank)
        listOf(2, 1, 3).mapNotNull(byRank::get).forEach { entry ->
            topThreeContainer.addView(createPodiumCard(entry))
        }

        val runners = board.entries.filter { it.rank in 4..10 }.sortedBy(RecognitionEntry::rank)
        runners.forEachIndexed { index, entry ->
            val column = if (index % 2 == 0) leftColumn else rightColumn
            column.addView(createRunnerRow(entry))
        }
        balanceColumns()
    }

    private fun createPodiumCard(entry: RecognitionEntry): View {
        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(6), dp(12), dp(6))
            background = context.getDrawable(
                when (entry.rank) {
                    1 -> R.drawable.bg_rank_gold
                    2 -> R.drawable.bg_rank_silver
                    else -> R.drawable.bg_rank_bronze
                }
            )
        }
        card.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f).apply {
            marginStart = dp(7)
            marginEnd = dp(7)
            if (entry.rank == 1) {
                topMargin = 0
            } else {
                topMargin = dp(10)
            }
        }

        card.addView(text("#${entry.rank}", 19f, rankColor(entry.rank), Typeface.BOLD))
        card.addView(avatar(entry, dp(44), 17f).apply {
            layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)).apply { topMargin = dp(3) }
        })
        card.addView(text(entry.name, 16f, Color.WHITE, Typeface.BOLD).apply {
            gravity = Gravity.CENTER
            maxLines = 1
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(3) }
        })
        card.addView(text(entry.role, 11f, context.getColor(R.color.white_70), Typeface.NORMAL).apply {
            gravity = Gravity.CENTER
            maxLines = 1
        })
        card.addView(text(RevenueFormatter.format(entry.revenue), 15f, context.getColor(R.color.gold_300), Typeface.BOLD).apply {
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(3) }
        })
        return card
    }

    private fun createRunnerRow(entry: RecognitionEntry): View {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(4), dp(12), dp(4))
            background = context.getDrawable(R.drawable.bg_runner)
        }
        row.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ).apply {
            topMargin = dp(3)
            bottomMargin = dp(3)
        }

        row.addView(text("${entry.rank}", 17f, context.getColor(R.color.gold_500), Typeface.BOLD).apply {
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(dp(34), LinearLayout.LayoutParams.MATCH_PARENT)
        })
        row.addView(avatar(entry, dp(34), 12f).apply {
            layoutParams = LinearLayout.LayoutParams(dp(34), dp(34)).apply { marginEnd = dp(10) }
        })
        row.addView(
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
                addView(text(entry.name, 15f, Color.WHITE, Typeface.BOLD).apply { maxLines = 1 })
                addView(text(entry.role, 11f, context.getColor(R.color.white_70), Typeface.NORMAL).apply { maxLines = 1 })
            },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f)
        )
        row.addView(text(RevenueFormatter.format(entry.revenue), 14f, context.getColor(R.color.gold_300), Typeface.BOLD).apply {
            gravity = Gravity.CENTER_VERTICAL or Gravity.END
            maxLines = 1
        })
        return row
    }

    private fun balanceColumns() {
        while (leftColumn.childCount > rightColumn.childCount) rightColumn.addView(spacer())
        while (rightColumn.childCount > leftColumn.childCount) leftColumn.addView(spacer())
    }

    private fun spacer(): View = View(context).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f).apply {
            topMargin = dp(3)
            bottomMargin = dp(3)
        }
    }

    private fun avatar(entry: RecognitionEntry, sizePx: Int, initialsSizeSp: Float): View =
        FrameLayout(context).apply {
            addView(
                text(initials(entry.name), initialsSizeSp, Color.WHITE, Typeface.BOLD).apply {
                    gravity = Gravity.CENTER
                    background = context.getDrawable(R.drawable.bg_avatar)
                },
                FrameLayout.LayoutParams(sizePx, sizePx, Gravity.CENTER)
            )
            val image = ImageView(context).apply {
                contentDescription = "Ảnh ${entry.name}"
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = context.getDrawable(R.drawable.bg_avatar)
                clipToOutline = true
                visibility = View.GONE
            }
            addView(image, FrameLayout.LayoutParams(sizePx, sizePx, Gravity.CENTER))
            avatarLoader.load(entry.avatarUrl, image)
        }

    private fun text(value: String, sizeSp: Float, color: Int, style: Int): TextView =
        TextView(context).apply {
            text = value
            textSize = sizeSp
            setTextColor(color)
            setTypeface(Typeface.DEFAULT, style)
            includeFontPadding = false
        }

    private fun rankColor(rank: Int): Int = when (rank) {
        1 -> context.getColor(R.color.gold_500)
        2 -> context.getColor(R.color.silver_300)
        else -> context.getColor(R.color.bronze_400)
    }

    private fun initials(name: String): String = name.trim()
        .split(Regex("\\s+"))
        .filter(String::isNotBlank)
        .takeLast(2)
        .mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .joinToString("")
        .ifBlank { "TV" }
        .uppercase(Locale.forLanguageTag("vi-VN"))

    private fun dp(value: Int): Int = (value * context.resources.displayMetrics.density).toInt()

    fun close() {
        avatarLoader.close()
    }
}
