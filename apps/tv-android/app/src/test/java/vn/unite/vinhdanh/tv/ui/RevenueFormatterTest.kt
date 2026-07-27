package vn.unite.vinhdanh.tv.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class RevenueFormatterTest {
    @Test
    fun formatsVietnameseRevenueWithDotThousandsAndCurrency() {
        assertEquals("156.000.000 VNĐ", RevenueFormatter.format(156_000_000L))
    }

    @Test
    fun formatsZeroRevenue() {
        assertEquals("0 VNĐ", RevenueFormatter.format(0L))
    }
}
