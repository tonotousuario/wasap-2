package wasap

/** Escapes text for HTML element content and quoted attribute values. */
fun escapeHtml(value: String): String = buildString(value.length) {
    for (ch in value) {
        when (ch) {
            '&' -> append("&amp;")
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '"' -> append("&quot;")
            '\'' -> append("&#39;")
            else -> append(ch)
        }
    }
}

/** Markup produced by this server (QR SVG), the only thing written without escaping. */
class TrustedHtml internal constructor(val value: String)

/**
 * Minimal HTML builder for the panel: text and attribute values are always escaped, tag and
 * attribute names are fixed identifiers, so user data cannot become markup.
 */
class Html {
    private val out = StringBuilder()
    private val name = Regex("[a-z][a-z0-9-]*")

    fun text(value: Any?) {
        out.append(escapeHtml(value?.toString() ?: ""))
    }

    operator fun String.unaryPlus() = text(this)

    fun trusted(markup: TrustedHtml) {
        out.append(markup.value)
    }

    private fun open(tag: String, attrs: Array<out Pair<String, Any?>>) {
        require(name.matches(tag))
        out.append('<').append(tag)
        for ((key, value) in attrs) {
            require(name.matches(key)) { "atributo inválido" }
            when (value) {
                null, false -> {}
                true -> out.append(' ').append(key)
                else -> out.append(' ').append(key).append("=\"").append(escapeHtml(value.toString())).append('"')
            }
        }
        out.append('>')
    }

    fun tag(tag: String, vararg attrs: Pair<String, Any?>, body: Html.() -> Unit = {}) {
        open(tag, attrs)
        body()
        out.append("</").append(tag).append('>')
    }

    /** Elements without content (input, meta, link, br). */
    fun void(tag: String, vararg attrs: Pair<String, Any?>) = open(tag, attrs)

    fun h1(text: String) = tag("h1") { +text }
    fun h2(text: String) = tag("h2") { +text }
    fun p(vararg attrs: Pair<String, Any?>, body: Html.() -> Unit) = tag("p", *attrs, body = body)
    fun div(vararg attrs: Pair<String, Any?>, body: Html.() -> Unit) = tag("div", *attrs, body = body)
    fun a(href: String, vararg attrs: Pair<String, Any?>, body: Html.() -> Unit) = tag("a", "href" to href, *attrs, body = body)

    /** A POST form carrying the session's anti-CSRF token. */
    fun form(action: String, csrf: String, vararg attrs: Pair<String, Any?>, body: Html.() -> Unit) = tag("form", "method" to "post", "action" to action, *attrs) {
        void("input", "type" to "hidden", "name" to "csrf", "value" to csrf)
        body()
    }

    fun field(label: String, name: String, type: String = "text", value: String? = null, vararg extra: Pair<String, Any?>) = tag("label", "class" to "field") {
        tag("span") { +label }
        void("input", "type" to type, "name" to name, "value" to value, *extra)
    }

    fun button(label: String, vararg attrs: Pair<String, Any?>) = tag("button", "type" to "submit", *attrs) { +label }

    override fun toString() = out.toString()
}

fun html(body: Html.() -> Unit): String = Html().apply(body).toString()
