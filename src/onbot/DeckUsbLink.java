package org.firstinspires.ftc.teamcode;

import android.content.Context;

import com.qualcomm.ftccommon.FtcEventLoop;

import org.firstinspires.ftc.ftccommon.external.OnCreateEventLoop;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Collections;

/**
 * Torque over the USB cable. Deck installs this file with OnBot Java; it is team code, started by the
 * SDK's @OnCreateEventLoop hook as FTC Dashboard is. It listens on this hub's loopback, TCP port 20885, which Deck
 * reaches through ADB on the USB cable, and passes the Driver Station's Robocol packets to the Robot Controller on this
 * hub and its answers back. Over TCP each packet is a 2-byte length and the packet.
 *
 * The Robot Controller listens on its own network address (192.168.43.1 on a Control Hub) and answers a Driver Station
 * on port 20884 of the address it came from, so the link sends from 127.0.0.1:20884 and hears the answers there. One
 * station at a time, as over Wi-Fi. Deck writes this file again when it changes; delete it to remove the USB link.
 */
public final class DeckUsbLink {
    public static final int PORT = 20885;
    private static final int ROBOCOL_PORT = 20884;
    private static ServerSocket server;

    private DeckUsbLink() {}

    @OnCreateEventLoop
    public static synchronized void start(Context context, FtcEventLoop eventLoop) {
        if (server != null && !server.isClosed()) return;
        try {
            server = new ServerSocket(PORT, 1, InetAddress.getByName("127.0.0.1"));
        } catch (IOException e) {
            return;
        }
        Thread accept = new Thread(new Runnable() {
            @Override public void run() { accept(); }
        }, "Deck USB link");
        accept.setDaemon(true);
        accept.start();
    }

    private static void accept() {
        while (true) {
            Socket station;
            try {
                station = server.accept();
            } catch (IOException e) {
                if (server.isClosed()) return;
                continue;
            }
            try {
                relay(station);
            } catch (IOException ignored) {
                // The station went away: wait for the next one.
            } finally {
                try { station.close(); } catch (IOException ignored) {}
            }
        }
    }

    /** Where the Robot Controller listens: 192.168.43.1 on a Control Hub, else this device's first network address. */
    static InetAddress controllerAddress() throws IOException {
        InetAddress first = null;
        for (NetworkInterface n : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!n.isUp() || n.isLoopback()) continue;
            for (InetAddress a : Collections.list(n.getInetAddresses())) {
                if (!(a instanceof Inet4Address)) continue;
                if ("192.168.43.1".equals(a.getHostAddress())) return a;
                if (first == null) first = a;
            }
        }
        return first != null ? first : InetAddress.getByName("192.168.43.1");
    }

    private static void relay(Socket station) throws IOException {
        station.setTcpNoDelay(true);
        final DatagramSocket udp = new DatagramSocket(null);
        udp.setReuseAddress(true);
        udp.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), ROBOCOL_PORT));
        final InetSocketAddress controller = new InetSocketAddress(controllerAddress(), ROBOCOL_PORT);
        final DataInputStream in = new DataInputStream(new BufferedInputStream(station.getInputStream()));
        final DataOutputStream out = new DataOutputStream(new BufferedOutputStream(station.getOutputStream()));
        Thread answers = new Thread(new Runnable() {
            @Override public void run() {
                byte[] buffer = new byte[65535];
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try {
                    while (!udp.isClosed()) {
                        packet.setLength(buffer.length);
                        udp.receive(packet);
                        synchronized (out) {
                            out.writeShort(packet.getLength());
                            out.write(buffer, 0, packet.getLength());
                            out.flush();
                        }
                    }
                } catch (IOException ignored) {
                    // Closed with the station.
                }
            }
        }, "Deck USB link answers");
        answers.setDaemon(true);
        answers.start();
        try {
            while (true) {
                int length = in.readUnsignedShort();
                byte[] bytes = new byte[length];
                in.readFully(bytes);
                udp.send(new DatagramPacket(bytes, length, controller));
            }
        } finally {
            udp.close();
        }
    }
}
