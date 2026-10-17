package dev.deckdriverstation.app;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
public final class AndroidProxySmoke {
 public static void main(String[] args)throws Exception{
  HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",exchange->{String body=exchange.getRequestMethod().equals("POST")?new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8):"<title>Original robot</title><button>Teleop</button>";byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","text/html");exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();String target="http://127.0.0.1:"+server.getAddress().getPort();
  try(RobotProxy bridge=new RobotProxy(target,"Robot A")){String url=bridge.startUrl();if(!new String(URI.create(url).toURL().openStream().readAllBytes(),StandardCharsets.UTF_8).contains("Original robot"))throw new AssertionError("Robot HTML was changed");HttpURLConnection c=(HttpURLConnection)URI.create(url).toURL().openConnection();c.setRequestMethod("POST");c.setDoOutput(true);byte[] b="{\"forward\":1}".getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(b.length);c.getOutputStream().write(b);String response=new String(c.getInputStream().readAllBytes(),StandardCharsets.UTF_8);if(!response.equals("{\"forward\":1}"))throw new AssertionError("Robot request body was lost");if(!bridge.robotUrl(url).equals(target+"/"))throw new AssertionError("Address mapping failed");try(RobotProxy second=new RobotProxy(target,"Robot B")){if(URI.create(second.origin).getHost().equals(URI.create(bridge.origin).getHost()))throw new AssertionError("Robot cookie origins collided");}System.out.println("PASS: Android Java bridge preserves robot HTML and POST actions; origins are isolated by Wi-Fi and robot address.");}finally{server.stop(0);}
 }
}
