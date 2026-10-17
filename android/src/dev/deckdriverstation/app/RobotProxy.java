package dev.deckdriverstation.app;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.*;

/** Single-robot streaming loopback bridge; no HTML or robot controls are generated here. */
public final class RobotProxy implements AutoCloseable {
    private final URI target;
    private final ServerSocket server;
    private final Set<Socket> sockets=ConcurrentHashMap.newKeySet();
    private final ExecutorService workers=Executors.newCachedThreadPool();
    public final String origin;
    public RobotProxy(String url,String network) throws Exception {
        target=URI.create(url);
        byte[] key=MessageDigest.getInstance("SHA-256").digest((network+"\0"+target.getScheme()+"://"+target.getAuthority()).getBytes(StandardCharsets.UTF_8));
        String loop="127."+(1+(key[0]&255)%253)+"."+(key[1]&255)+"."+(1+(key[2]&255)%253);
        server=new ServerSocket();server.bind(new InetSocketAddress(InetAddress.getByName(loop),0));
        origin="http://"+loop+":"+server.getLocalPort();
        workers.execute(()->{while(!server.isClosed()){try{Socket client=server.accept();sockets.add(client);workers.execute(()->forward(client));}catch(IOException e){break;}}});
    }
    public String startUrl(){return origin+(target.getRawPath()==null||target.getRawPath().isEmpty()?"/":target.getRawPath())+(target.getRawQuery()==null?"":"?"+target.getRawQuery())+(target.getRawFragment()==null?"":"#"+target.getRawFragment());}
    public boolean owns(String url){try{return authority(URI.create(url)).equals(origin);}catch(Exception e){return false;}}
    private static String authority(URI u){return u.getScheme()+"://"+u.getAuthority();}
    public String robotUrl(String local){URI u=URI.create(local);return authority(target)+(u.getRawPath()==null?"/":u.getRawPath())+(u.getRawQuery()==null?"":"?"+u.getRawQuery())+(u.getRawFragment()==null?"":"#"+u.getRawFragment());}
    public String localUrl(String robot){URI u=URI.create(robot);if(!authority(u).equals(authority(target)))return null;return origin+(u.getRawPath()==null?"/":u.getRawPath())+(u.getRawQuery()==null?"":"?"+u.getRawQuery())+(u.getRawFragment()==null?"":"#"+u.getRawFragment());}
    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();int state=0;
        while(out.size()<65536){int c=in.read();if(c<0)throw new EOFException();out.write(c);state=(state==0&&c==13)?1:(state==1&&c==10)?2:(state==2&&c==13)?3:(state==3&&c==10)?4:0;if(state==4)return out.toString("ISO-8859-1");}
        throw new IOException("Header too large");
    }
    private static void copy(InputStream in,OutputStream out) throws IOException {byte[] bytes=new byte[32768];int n;while((n=in.read(bytes))!=-1){out.write(bytes,0,n);out.flush();}}
    private void forward(Socket client){Socket upstream=null;
        try{
            client.setSoTimeout(20000);String head=readHead(client.getInputStream());String[] lines=head.split("\r\n");String[] first=lines[0].split(" ",3);if(first.length!=3||!first[1].startsWith("/")||first[1].startsWith("//"))throw new IOException("Invalid request");
            StringBuilder headers=new StringBuilder(lines[0]+"\r\n");int length=0;boolean upgrade=false;String host="",requestOrigin="";
            for(int i=1;i<lines.length;i++){int colon=lines[i].indexOf(':');if(colon<0)continue;String name=lines[i].substring(0,colon),value=lines[i].substring(colon+1).trim();
                if(name.equalsIgnoreCase("Host")){host=value;continue;}if(name.equalsIgnoreCase("Origin")){requestOrigin=value;headers.append("Origin: ").append(value.equals(origin)?authority(target):value).append("\r\n");continue;}
                if(name.equalsIgnoreCase("Connection"))continue;if(name.equalsIgnoreCase("Upgrade"))upgrade=true;if(name.equalsIgnoreCase("Content-Length"))length=Integer.parseInt(value);
                if(name.equalsIgnoreCase("Referer")&&value.startsWith(origin+"/"))value=authority(target)+value.substring(origin.length());headers.append(name).append(": ").append(value).append("\r\n");
            }
            if(!host.equals(URI.create(origin).getAuthority())||(!requestOrigin.isEmpty()&&!requestOrigin.equals(origin)))throw new IOException("Foreign origin rejected");
            int port=target.getPort()>0?target.getPort():(target.getScheme().equals("https")?443:80);
            if(target.getScheme().equals("https")){
                SSLSocket ssl=(SSLSocket)SSLSocketFactory.getDefault().createSocket(target.getHost(),port);SSLParameters params=ssl.getSSLParameters();params.setEndpointIdentificationAlgorithm("HTTPS");ssl.setSSLParameters(params);ssl.startHandshake();upstream=ssl;
            }else{upstream=new Socket();upstream.connect(new InetSocketAddress(target.getHost(),port),12000);}
            sockets.add(upstream);upstream.setSoTimeout(upgrade?0:20000);client.setSoTimeout(upgrade?0:20000);
            headers.append("Host: ").append(target.getAuthority()).append("\r\nConnection: ").append(upgrade?"Upgrade":"close").append("\r\n\r\n");OutputStream remoteOut=upstream.getOutputStream();remoteOut.write(headers.toString().getBytes(StandardCharsets.ISO_8859_1));
            if(upgrade){final Socket remote=upstream;workers.execute(()->{try{copy(client.getInputStream(),remote.getOutputStream());}catch(IOException ignored){}finally{try{remote.close();}catch(IOException ignored){}}});}
            else{byte[] body=new byte[32768];while(length>0){int n=client.getInputStream().read(body,0,Math.min(length,body.length));if(n<0)throw new EOFException();remoteOut.write(body,0,n);length-=n;}remoteOut.flush();}
            InputStream remoteIn=upstream.getInputStream();String replyHead=readHead(remoteIn);StringBuilder response=new StringBuilder();String[] replyLines=replyHead.split("\r\n");response.append(replyLines[0]).append("\r\n");
            for(int i=1;i<replyLines.length;i++){String line=replyLines[i];if(line.toLowerCase(Locale.ROOT).startsWith("set-cookie:"))line=line.replaceAll("(?i);\\s*Domain=[^;]+","");if(line.toLowerCase(Locale.ROOT).startsWith("location:")){String location=target.resolve(line.substring(9).trim()).toString();String local=localUrl(location);if(local!=null)line="Location: "+local;}response.append(line).append("\r\n");}response.append("\r\n");client.getOutputStream().write(response.toString().getBytes(StandardCharsets.ISO_8859_1));copy(remoteIn,client.getOutputStream());
        }catch(Exception e){try{client.getOutputStream().write("HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nRobot is not reachable. Check Wi-Fi and its IP address.".getBytes(StandardCharsets.UTF_8));}catch(IOException ignored){}
        }finally{if(upstream!=null){sockets.remove(upstream);try{upstream.close();}catch(IOException ignored){}}sockets.remove(client);try{client.close();}catch(IOException ignored){}}
    }
    public void close(){try{server.close();}catch(IOException ignored){}for(Socket s:sockets)try{s.close();}catch(IOException ignored){}sockets.clear();workers.shutdownNow();}
}
