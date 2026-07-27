package vn.unite.vinhdanh.tv.ui

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

object RevenueFormatter {
    private val formatter = DecimalFormat("#,##0", DecimalFormatSymbols(Locale.US))

    @Synchronized
    fun format(value: Long): String = formatter.format(value).replace(',', '.') + " VNĐ"
}
