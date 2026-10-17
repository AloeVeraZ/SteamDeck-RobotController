package dev.deckdriverstation.app;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.*;
import org.json.*;

/** Native updater; robot WebViews never receive an update bridge or install permission. */
final class AppUpdates {
    private final Activity activity;
    private boolean busy=false;
    private AlertDialog dialog;
    private final String current;
    private JSONObject release,asset;
    private String repo=AppVersion.REPOSITORY,version="";
    private TextView status;
    private Button check,download,install;
    private EditText repository;
    private Spinner channels;
    private String channel;
    private boolean updatingSpinner;
    private File apk;
    AppUpdates(Activity activity) throws Exception {this.activity=activity;current=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionName;channel=activity.getPreferences(0).getString("updateChannel",AppVersion.CHANNEL);}
    void show(){
        if(dialog!=null&&dialog.isShowing())return;
        if(busy){Toast.makeText(activity,"An update operation is still running.",Toast.LENGTH_SHORT).show();return;}
        release=null;asset=null;apk=null;
        LinearLayout layout=new LinearLayout(activity);layout.setOrientation(LinearLayout.VERTICAL);int padding=(int)(20*activity.getResources().getDisplayMetrics().density);layout.setPadding(padding,padding,padding,padding);
        TextView info=new TextView(activity);info.setText("Installed "+current+" · "+AppVersion.CHANNEL+"\nUpdate channel");layout.addView(info);
        channels=new Spinner(activity);channels.setAdapter(new ArrayAdapter<String>(activity,android.R.layout.simple_spinner_dropdown_item,new String[]{"Main — stable","Testing — experimental"}));channels.setSelection(channel.equals("main")?0:1);layout.addView(channels);
        channels.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onNothingSelected(android.widget.AdapterView<?> parent){}public void onItemSelected(android.widget.AdapterView<?> parent,android.view.View view,int position,long id){if(updatingSpinner)return;String choice=position==0?"main":"testing";if(choice.equals(channel))return;if(choice.equals("testing")){new AlertDialog.Builder(activity).setTitle("Use experimental updates?").setMessage("Testing may contain unfinished features and bugs. Saved robots and Wi-Fi settings are kept.").setPositiveButton("Use Testing",(d,w)->saveChannel("testing")).setNegativeButton("Stay on Main",(d,w)->resetChannel()).setOnCancelListener(d->resetChannel()).show();}else saveChannel(choice);}});
        TextView repoLabel=new TextView(activity);repoLabel.setText("GitHub repository");layout.addView(repoLabel);
        repository=new EditText(activity);repository.setSingleLine(true);repository.setText(activity.getPreferences(0).getString("updateRepository",repo));layout.addView(repository);
        status=new TextView(activity);status.setText("Check for a published update. Internet is required.");layout.addView(status);
        check=new Button(activity);check.setText("Check for updates");layout.addView(check);
        download=new Button(activity);download.setText("Download update");download.setVisibility(8);layout.addView(download);
        install=new Button(activity);install.setText("Install update");install.setVisibility(8);layout.addView(install);
        check.setOnClickListener(v->{String input=repository.getText().toString().trim().replaceFirst("^https://github.com/","").replaceFirst("\\.git$","").replaceFirst("/$","");if(!input.matches("[\\w-]+/[\\w.-]+")){status.setText("Enter owner/repository.");return;}repo=input;activity.getPreferences(0).edit().putString("updateRepository",repo).apply();download.setVisibility(8);install.setVisibility(8);release=null;asset=null;work(this::checkRelease);});
        download.setOnClickListener(v->work(this::download));install.setOnClickListener(v->{try{install();}catch(Exception e){status.setText(e.getMessage());}});
        ScrollView scroll=new ScrollView(activity);scroll.addView(layout);dialog=new AlertDialog.Builder(activity).setTitle("App updates · GitHub").setView(scroll).setNegativeButton("Close",(d,w)->{}).create();dialog.show();int width=activity.getResources().getDisplayMetrics().widthPixels;dialog.getWindow().setLayout(Math.min((int)(800*activity.getResources().getDisplayMetrics().density),width-padding),android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
    }
    private void resetChannel(){updatingSpinner=true;channels.setSelection(channel.equals("main")?0:1);updatingSpinner=false;}
    private void saveChannel(String choice){channel=choice;activity.getPreferences(0).edit().putString("updateChannel",choice).apply();release=null;asset=null;apk=null;download.setVisibility(8);install.setVisibility(8);status.setText("Channel saved. Check for a published "+channel+" release.");}
    private interface Action {String run() throws Exception;}
    private void work(Action action){busy=true;channels.setEnabled(false);check.setEnabled(false);download.setEnabled(false);install.setEnabled(false);repository.setEnabled(false);status.setText("Working…");new Thread(()->{String message;try{message=action.run();}catch(Exception e){message=e.getMessage()==null?e.toString():e.getMessage();}final String result=message;activity.runOnUiThread(()->{busy=false;if(activity.isDestroyed())return;status.setText(result);channels.setEnabled(true);check.setEnabled(true);download.setEnabled(true);install.setEnabled(true);repository.setEnabled(true);download.setVisibility(asset!=null&&apk==null?0:8);install.setVisibility(apk!=null?0:8);});},"App update").start();}
    private HttpURLConnection connect(String address) throws Exception {
        URL url=new URL(address);
        for(int redirects=0;redirects<6;redirects++){
            String host=url.getHost();if(!url.getProtocol().equals("https")||!(host.equals("api.github.com")||host.equals("github.com")||host.equals("release-assets.githubusercontent.com")||host.equals("objects.githubusercontent.com")))throw new IOException("Invalid GitHub download host.");
            HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setConnectTimeout(20000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(false);c.setRequestProperty("User-Agent","DeckDriverStation");c.setRequestProperty("Accept",host.equals("api.github.com")?"application/vnd.github+json":"application/octet-stream");int code=c.getResponseCode();
            if(code>=300&&code<400){String location=c.getHeaderField("Location");c.disconnect();url=new URL(url,location);continue;}
            if(code!=200){c.disconnect();throw new IOException(code==404?"Repository or release not found. It may be private or unpublished.":code==403||code==429?"GitHub rate limit or access restriction. Try later.":"GitHub returned HTTP "+code);}
            return c;
        }throw new IOException("Too many GitHub redirects.");
    }
    private String read(String url) throws Exception {HttpURLConnection c=connect(url);try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>8*1024*1024)throw new IOException("GitHub response too large.");out.write(b,0,n);}return out.toString("UTF-8");}finally{c.disconnect();}}
    private static int compare(String a,String b){String[] x=a.split("\\."),y=b.split("\\.");for(int i=0;i<3;i++){int d=Integer.compare(Integer.parseInt(x[i]),Integer.parseInt(y[i]));if(d!=0)return d;}return 0;}
    private String checkRelease() throws Exception {
        apk=null;version="";boolean testing=channel.equals("testing");Pattern tag=Pattern.compile((testing?"^testing-v":"^v")+"(\\d+\\.\\d+\\.\\d+)$");
        for(int page=1;page<=5;page++){JSONArray list=new JSONArray(read("https://api.github.com/repos/"+repo+"/releases?per_page=100&page="+page));for(int i=0;i<list.length();i++){JSONObject r=list.getJSONObject(i);Matcher m=tag.matcher(r.optString("tag_name"));if(r.optBoolean("draft")||r.optBoolean("prerelease")!=testing||!m.matches())continue;String v=m.group(1);if(version.isEmpty()||compare(v,version)>0){release=r;version=v;}}if(list.length()<100)break;}
        if(release==null)return "No "+channel+" releases have been published yet.";
        if(!channel.equals(AppVersion.CHANNEL)&&compare(version,current)<0)return "The latest "+channel+" APK is older than this app. Android does not allow installing it over a newer version. This channel is saved; wait for a newer release to keep all app data.";
        if(channel.equals(AppVersion.CHANNEL)&&compare(version,current)<=0)return "You’re up to date. Latest "+channel+" release: "+version;
        String name="DeckDriverStation-"+version+"-Android.apk";JSONArray assets=release.getJSONArray("assets");for(int i=0;i<assets.length();i++){JSONObject a=assets.getJSONObject(i);if(name.equals(a.optString("name"))&&"uploaded".equals(a.optString("state"))){validateUrl(a.getString("browser_download_url"));asset=a;break;}}
        if(asset==null)throw new IOException("Release "+version+" has no Android APK yet.");return "Version "+version+" is available.";
    }
    private void validateUrl(String address) throws Exception {URI u=new URI(address);String prefix="/"+repo+"/releases/download/"+release.getString("tag_name")+"/";if(!"https".equals(u.getScheme())||!"github.com".equals(u.getHost())||u.getUserInfo()!=null||!u.getPath().startsWith(prefix))throw new IOException("Download is outside the selected GitHub release.");}
    private String download() throws Exception {
        if(asset==null)throw new IOException("Check for updates first.");String address=asset.getString("browser_download_url");validateUrl(address);String hash=asset.optString("digest").replaceFirst("^sha256:","");
        if(!hash.matches("[a-fA-F0-9]{64}")){String[] parts=read(address+".sha256").trim().split("\\s+");if(parts.length!=2||!parts[0].matches("[a-fA-F0-9]{64}")||!parts[1].replaceFirst("^\\*","").equals(asset.getString("name")))throw new IOException("Release checksum is missing or invalid.");hash=parts[0];}
        File folder=new File(activity.getCacheDir(),"verified-update");folder.mkdirs();File partial=new File(folder,"download.part"),verified=new File(folder,"update.apk");long total=0;MessageDigest digest=MessageDigest.getInstance("SHA-256");HttpURLConnection c=connect(address);
        try(InputStream input=c.getInputStream();FileOutputStream output=new FileOutputStream(partial)){byte[] b=new byte[65536];int n;while((n=input.read(b))!=-1){total+=n;if(total>700L*1024*1024)throw new IOException("Update exceeds size limit.");digest.update(b,0,n);output.write(b,0,n);}}catch(Exception e){partial.delete();throw e;}finally{c.disconnect();}
        StringBuilder actual=new StringBuilder();for(byte b:digest.digest())actual.append(String.format(Locale.ROOT,"%02x",b));if(!hash.equalsIgnoreCase(actual.toString())||(asset.optLong("size")>0&&asset.optLong("size")!=total)){partial.delete();throw new IOException("Update checksum/size mismatch. Nothing installed.");}
        PackageManager pm=activity.getPackageManager();int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;PackageInfo candidate=pm.getPackageArchiveInfo(partial.getPath(),flags),installed=pm.getPackageInfo(activity.getPackageName(),flags);
        if(candidate==null||!activity.getPackageName().equals(candidate.packageName)||!version.equals(candidate.versionName)||!sameSigner(candidate,installed)){partial.delete();throw new IOException("APK identity or signing key does not match this app.");}
        if(verified.exists()&&!verified.delete())throw new IOException("Previous download is in use.");if(!partial.renameTo(verified))throw new IOException("Could not save verified APK.");apk=verified;return "Download verified. Android will ask you to approve installation. Saved robots are kept.";
    }
    private boolean sameSigner(PackageInfo a,PackageInfo b){android.content.pm.Signature[] x=Build.VERSION.SDK_INT>=28?a.signingInfo.getApkContentsSigners():a.signatures,y=Build.VERSION.SDK_INT>=28?b.signingInfo.getApkContentsSigners():b.signatures;return x!=null&&y!=null&&Arrays.equals(x,y);}
    private void install() throws Exception {
        if(apk==null)throw new IOException("Download an update first.");if(!activity.getPackageManager().canRequestPackageInstalls()){activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));status.setText("Allow updates from this app, return here, then press Install update again.");return;}
        Intent intent=new Intent(Intent.ACTION_VIEW);intent.setDataAndType(Uri.parse("content://"+activity.getPackageName()+".updates/apk"),"application/vnd.android.package-archive");intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);activity.startActivity(intent);
    }
}
