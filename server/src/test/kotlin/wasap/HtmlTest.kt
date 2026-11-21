package wasap

import org.junit.jupiter.api.Test
import kotlin.test.*

class HtmlTest {
    @Test fun `user data is shown literally, in text and in attributes`() {
        val name = "<script>alert(1)</script>"
        val page = html {
            tag("td") { +name }
            void("input", "name" to "n", "value" to "\" onfocus=\"alert(1)")
            a("/u?q=$name") { +"x'y&z" }
        }
        assertFalse(page.contains("<script>"), page)
        assertTrue(page.contains("&lt;script&gt;alert(1)&lt;/script&gt;"))
        assertTrue(page.contains("value=\"&quot; onfocus=&quot;alert(1)\""))
        assertTrue(page.contains("x&#39;y&amp;z"))
    }

    @Test fun `tag and attribute names cannot be injected`() {
        assertFails { html { tag("td onclick=x") {} } }
        assertFails { html { void("input", "onclick=\"x\" a" to "1") } }
    }

    @Test fun `forms always carry the anti-CSRF token`() {
        val page = html { form("/x", "tok\"en") { button("Ir") } }
        assertTrue(page.contains("<input type=\"hidden\" name=\"csrf\" value=\"tok&quot;en\">"))
    }
}
