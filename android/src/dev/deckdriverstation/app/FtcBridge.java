package dev.deckdriverstation.app;

import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.net.*;
import org.json.JSONObject;

/** UDP bridge for the bundled FTC Driver Station page. Robot Controllers always reply to port 20884. */
public final class FtcBridge implements AutoCloseable {
    public static final int PORT=20884;
    public interface Host { void programAndManage(); }
    private final DatagramSocket socket;
    private final InetAddress robot;
    private final String host,name;
    private final Handler main=new Handler(Looper.getMainLooper());
    private volatile WebView view;
    private final Host owner;
    private static DatagramSocket open() throws SocketException {
        // A station that just closed releases the port shortly after sending its stop request.
        for(int attempt=0;;attempt++){
            DatagramSocket s=new DatagramSocket(null);s.setReuseAddress(false);
            try{s.bind(new InetSocketAddress(PORT));return s;}catch(SocketException e){s.close();if(attempt>=4)throw new SocketException("UDP port 20884 is in use by another app. Close other FTC Driver Station apps, then try again.");}
            try{Thread.sleep(150);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new SocketException("Interrupted");}
        }
    }
    public FtcBridge(String host,String name,Host owner) throws Exception {
        this.host=host;this.name=name;this.owner=owner;robot=InetAddress.getByName(host);socket=open();
        Thread reader=new Thread(()->{byte[] buffer=new byte[65535];while(!socket.isClosed()){try{DatagramPacket p=new DatagramPacket(buffer,buffer.length);socket.receive(p);if(!p.getAddress().equals(robot)||p.getPort()!=PORT)continue;
            String data=Base64.encodeToString(p.getData(),p.getOffset(),p.getLength(),Base64.NO_WRAP);main.post(()->{WebView v=view;if(v!=null)v.evaluateJavascript("window.__deckFtcPacket&&window.__deckFtcPacket('"+data+"')",null);});}catch(Exception e){if(socket.isClosed())break;}}},"ftc-robocol");
        reader.setDaemon(true);reader.start();
    }
    public void attach(WebView v){view=v;}
    public void setActive(boolean active){WebView v=view;if(v!=null)v.evaluateJavascript("window.__deckFtcActive&&window.__deckFtcActive("+active+")",null);}
    @JavascriptInterface public String info(){try{JSONObject o=new JSONObject();o.put("name",name);o.put("host",host);o.put("address",robot.getHostAddress());return o.toString();}catch(Exception e){return "{}";}}
    @JavascriptInterface public void send(String base64){try{byte[] b=Base64.decode(base64,Base64.DEFAULT);if(b.length>=5&&b.length<=65507)socket.send(new DatagramPacket(b,b.length,robot,PORT));}catch(Exception ignored){}}
    @JavascriptInterface public void programAndManage(){main.post(owner::programAndManage);}
    /** Sends the station's stop request, then closes. Robots also stop on their own after 2 s without a station. */
    public void close(){WebView v=view;view=null;if(v!=null)v.evaluateJavascript("window.deckShutdown&&window.deckShutdown()",null);main.postDelayed(socket::close,250);}
    /** True when a Robot Controller answers Robocol peer discovery. Call off the main thread. */
    public static boolean probe(String host,int timeoutMs){
        try(DatagramSocket s=open()){InetAddress robot=InetAddress.getByName(host);s.setSoTimeout(250);long end=System.currentTimeMillis()+timeoutMs;byte[] buffer=new byte[2048];int seq=1;
            while(System.currentTimeMillis()<end){
                byte[] d={3,0,10,124,1,0,(byte)seq++,9,0x07,(byte)0xe9,11,0,0};s.send(new DatagramPacket(d,d.length,robot,PORT));
                try{DatagramPacket p=new DatagramPacket(buffer,buffer.length);s.receive(p);if(p.getAddress().equals(robot)&&p.getLength()>=13&&buffer[0]==3)return true;}catch(SocketTimeoutException ignored){}
            }
        }catch(Exception ignored){}
        return false;
    }
}
