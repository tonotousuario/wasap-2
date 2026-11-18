package wasap

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.NetworkInterface

/** Addresses proposed for the server certificate's SAN, most useful first. */
object NetworkAddresses {
    /** Interface addresses of this machine (or container) that are up. */
    fun interfaceAddresses(): List<InetAddress> = NetworkInterface.networkInterfaces().toList()
        .filter { runCatching { it.isUp }.getOrDefault(false) }
        .flatMap { it.inetAddresses.toList() }

    /**
     * [configured] (SERVER_PUBLIC_ADDRESSES, comma separated) first, then private IPv4, other IPv4
     * and global IPv6; loopback, link-local and wildcard addresses are left out and duplicates removed.
     */
    fun detect(configured: String?, available: List<InetAddress> = interfaceAddresses()): List<String> {
        val explicit = configured.orEmpty().split(',').map { it.trim() }.filter { it.isNotEmpty() }
        val usable = available.filterNot { it.isLoopbackAddress || it.isLinkLocalAddress || it.isAnyLocalAddress || it.isMulticastAddress }
        val ordered = usable.filterIsInstance<Inet4Address>().filter { it.isSiteLocalAddress } +
            usable.filterIsInstance<Inet4Address>().filterNot { it.isSiteLocalAddress } +
            usable.filterIsInstance<Inet6Address>()
        return (explicit + ordered.map { it.hostAddress.substringBefore('%') }).distinct()
    }
}
