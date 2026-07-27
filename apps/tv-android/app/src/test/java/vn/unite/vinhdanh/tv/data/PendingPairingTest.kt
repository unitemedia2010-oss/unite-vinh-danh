package vn.unite.vinhdanh.tv.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingPairingTest {
    @Test
    fun expiryUsesServerDeadline() {
        val pending = PendingPairing("123456", "opaque", "pending", 10_000L)
        assertFalse(pending.isExpired(9_999L))
        assertTrue(pending.isExpired(10_000L))
    }

    @Test
    fun missingDeadlineDoesNotExpireLocally() {
        val pending = PendingPairing("123456", "opaque", "pending", 0L)
        assertFalse(pending.isExpired(Long.MAX_VALUE))
    }
}
