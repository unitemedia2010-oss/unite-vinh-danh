package vn.unite.vinhdanh.tv.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SupabaseRealtimeMessageParserTest {
    @Test
    fun decodesJoinReplyForScreenUpdatesTopic() {
        val signal = SupabaseRealtimeMessageParser.parse(
            """
            {
              "topic": "realtime:screen-updates",
              "event": "phx_reply",
              "payload": {"status": "ok", "response": {}},
              "ref": "1"
            }
            """.trimIndent()
        )

        assertEquals(
            RealtimeSignal.Joined("realtime:screen-updates"),
            signal
        )
    }

    @Test
    fun decodesReleasePublishedBroadcast() {
        val signal = SupabaseRealtimeMessageParser.parse(
            """
            {
              "topic": "realtime:screen-updates",
              "event": "broadcast",
              "payload": {
                "event": "release-published",
                "payload": {"releaseId": "release-42"}
              },
              "ref": null
            }
            """.trimIndent()
        )

        assertEquals(
            RealtimeSignal.ReleasePublished("release-42"),
            signal
        )
    }

    @Test
    fun decodesPhoenixArrayFrameAndIgnoresOtherEvents() {
        val signal = SupabaseRealtimeMessageParser.parse(
            """
            [null, "4", "realtime:screen-updates", "release-published",
              {"release_id": "release-array"}]
            """.trimIndent()
        )
        val ignored = SupabaseRealtimeMessageParser.parse(
            """
            {"topic":"phoenix","event":"phx_reply","payload":{"status":"ok"}}
            """.trimIndent()
        )

        assertEquals(
            RealtimeSignal.ReleasePublished("release-array"),
            signal
        )
        assertNull(ignored)
    }
}
