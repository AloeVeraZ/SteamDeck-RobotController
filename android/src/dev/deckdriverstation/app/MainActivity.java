package dev.deckdriverstation.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.input.InputManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.*;
import android.provider.Settings;
import android.text.InputType;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.net.URI;
import java.util.*;
import org.json.*;

public final class MainActivity extends Activity implements InputManager.InputDeviceListener {
    private final int BG=Color.rgb(17,23,27),PANEL=Color.rgb(27,37,43),TEXT=Color.rgb(234,243,238),MUTED=Color.rgb(139,166,174),GREEN=Color.rgb(170,241,202);
    private LinearLayout root,body,settingsContent,driveContent,libraryRows;
    private TextView address,controllers,wifiText;
    private EditText urlInput,nameInput,ssidInput,searchInput;
    private WebView browser;
    private RobotProxy proxy;
    private JSONArray robots=new JSONArray();
    private JSONObject active,pending;
    private String editId="",lastSsid="";
    private boolean settings=true,failed=false;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private InputManager inputManager;
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private GradientDrawable background(int color){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(9));return d;}
    private LinearLayout column(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private TextView text(String s,int size,int color){TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(color);return t;}
    private Button button(String title,Runnable action){Button b=new Button(this);b.setText(title);b.setTextColor(TEXT);b.setTextSize(12);b.setAllCaps(false);b.setBackground(background(Color.rgb(39,57,61)));b.setMinHeight(dp(44));b.setPadding(dp(12),dp(4),dp(12),dp(4));b.setOnClickListener(v->action.run());return b;}
    private void space(LinearLayout parent,int height){View s=new View(this);parent.addView(s,new LinearLayout.LayoutParams(1,dp(height)));}
    private EditText field(LinearLayout parent,String label,String hint){TextView title=text(label,12,MUTED);parent.addView(title);space(parent,5);EditText e=new EditText(this);e.setTextSize(14);e.setTextColor(TEXT);e.setHintTextColor(MUTED);e.setSingleLine(true);e.setHint(hint);e.setPadding(dp(10),dp(8),dp(10),dp(8));e.setBackground(background(Color.rgb(17,29,35)));parent.addView(e,new LinearLayout.LayoutParams(-1,dp(48)));space(parent,16);return e;}
    @Override public void onCreate(Bundle saved){super.onCreate(saved);getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);try{robots=new JSONArray(getPreferences(0).getString("robots","[]"));}catch(JSONException ignored){}
        root=column();root.setBackgroundColor(BG);setContentView(root);
        if(Build.VERSION.SDK_INT>=35)root.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets s=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(s.left,s.top,s.right,s.bottom);return insets;});
        LinearLayout top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL);top.setPadding(dp(12),dp(6),dp(12),dp(6));top.setBackgroundColor(PANEL);
        ImageView icon=new ImageView(this);icon.setImageResource(R.drawable.robot);top.addView(icon,new LinearLayout.LayoutParams(dp(34),dp(34)));
        Button drive=button("Drive",()->show(false)),config=button("Settings",()->show(true));LinearLayout.LayoutParams nav=new LinearLayout.LayoutParams(0,dp(44),1);nav.leftMargin=dp(8);top.addView(drive,nav);top.addView(config,new LinearLayout.LayoutParams(0,dp(44),1));
        Button more=button("⋮",()->{});more.setOnClickListener(v->{PopupMenu menu=new PopupMenu(this,more);menu.getMenu().add("Wi-Fi settings").setOnMenuItemClickListener(i->{wifiSettings();return true;});menu.getMenu().add("Saved robots").setOnMenuItemClickListener(i->{show(true);libraryRows.requestFocus();return true;});menu.getMenu().add("Close robot").setOnMenuItemClickListener(i->{closeRobot();return true;});menu.show();});top.addView(more,new LinearLayout.LayoutParams(dp(42),dp(44)));root.addView(top);
        controllers=text("Controller 1: waiting    •    Controller 2: not connected",10,MUTED);controllers.setPadding(dp(14),dp(7),dp(10),dp(7));root.addView(controllers);
        body=column();root.addView(body,new LinearLayout.LayoutParams(-1,0,1));buildSettings();buildDrive();inputManager=(InputManager)getSystemService(INPUT_SERVICE);inputManager.registerInputDeviceListener(this,handler);updateControllers();show(true);
    }
    private void buildSettings(){ScrollView scroll=new ScrollView(this);settingsContent=column();settingsContent.setPadding(dp(20),dp(22),dp(20),dp(22));scroll.addView(settingsContent);scroll.setTag("settings");
        TextView title=text("Set it once. Open it again.",25,TEXT);title.setTypeface(null,Typeface.BOLD);settingsContent.addView(title);space(settingsContent,8);settingsContent.addView(text("Wi-Fi and your robot’s own website, together.",12,MUTED));space(settingsContent,24);
        settingsContent.addView(text("01   Connect to Wi-Fi",17,GREEN));wifiText=text("Use Android Wi-Fi to join a robot hotspot or home network.",12,MUTED);settingsContent.addView(wifiText);space(settingsContent,10);
        settingsContent.addView(button("Open Wi-Fi panel",this::wifiSettings));space(settingsContent,8);settingsContent.addView(button("Read current network name",()->{if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},7);else refreshWifi();}));space(settingsContent,24);
        settingsContent.addView(text("02   Open the robot’s website",17,GREEN));space(settingsContent,12);urlInput=field(settingsContent,"Robot IP address or URL","192.168.4.1");urlInput.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);nameInput=field(settingsContent,"Robot name (optional)","Use the website’s title");ssidInput=field(settingsContent,"Associated Wi-Fi network","Current network, if available");
        LinearLayout buttons=new LinearLayout(this);Button open=button("Open robot ↗",()->{try{openRobot(form());}catch(Exception e){message(e.getMessage());}});open.setTextColor(BG);open.setBackground(background(GREEN));buttons.addView(open,new LinearLayout.LayoutParams(0,dp(46),1));Button save=button("Save address",()->{try{upsert(form(),false,"");renderLibrary();message("Robot saved on this device.");}catch(Exception e){message(e.getMessage());}});LinearLayout.LayoutParams right=new LinearLayout.LayoutParams(0,dp(46),1);right.leftMargin=dp(10);buttons.addView(save,right);settingsContent.addView(buttons);space(settingsContent,24);
        settingsContent.addView(text("YOUR SAVED ROBOTS",12,GREEN));searchInput=field(settingsContent,"Find a robot","Name, IP address, or Wi-Fi network");searchInput.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){renderLibrary();}public void afterTextChanged(android.text.Editable s){}});libraryRows=column();settingsContent.addView(libraryRows);space(settingsContent,18);settingsContent.addView(text("Initialization, teleop, and autonomous stay in the robot website. Website login credentials are not saved in this address list.",11,MUTED));body.addView(scroll,new LinearLayout.LayoutParams(-1,-1));renderLibrary();
    }
    private void buildDrive(){driveContent=column();LinearLayout toolbar=new LinearLayout(this);toolbar.setGravity(Gravity.CENTER_VERTICAL);toolbar.setPadding(dp(8),0,dp(8),0);toolbar.setBackgroundColor(PANEL);Button reload=button("↻",()->{if(browser!=null)browser.reload();});toolbar.addView(reload,new LinearLayout.LayoutParams(dp(42),dp(44)));address=text("No robot open",11,MUTED);address.setSingleLine(true);toolbar.addView(address,new LinearLayout.LayoutParams(0,dp(44),1));toolbar.addView(button("Close",this::closeRobot),new LinearLayout.LayoutParams(dp(65),dp(44)));driveContent.addView(toolbar);body.addView(driveContent,new LinearLayout.LayoutParams(-1,-1));}
    private void emptyDrive(){while(driveContent.getChildCount()>1)driveContent.removeViewAt(1);TextView empty=text("Open a saved robot from Settings to load its own controls.",17,MUTED);empty.setGravity(Gravity.CENTER);empty.setPadding(dp(30),dp(30),dp(30),dp(30));driveContent.addView(empty,new LinearLayout.LayoutParams(-1,0,1));}
    private void show(boolean config){settings=config;if(config)closeRobot();for(int i=0;i<body.getChildCount();i++){View child=body.getChildAt(i);child.setVisibility((child==driveContent?!config:config)?View.VISIBLE:View.GONE);}if(config){refreshWifi();renderLibrary();}else if(browser==null)emptyDrive();}
    private String ssid(){try{if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)return "";WifiManager manager=(WifiManager)getApplicationContext().getSystemService(WIFI_SERVICE);String s=manager.getConnectionInfo().getSSID();if(s==null||s.equals("<unknown ssid>"))return "";return s.replaceAll("^\"|\"$","");}catch(Exception e){return "";}}
    private void refreshWifi(){lastSsid=ssid();if(wifiText!=null)wifiText.setText(lastSsid.isEmpty()?"SSID is unavailable. Connect using Android’s Wi-Fi panel; you can enter the network name manually.":"Connected to "+lastSsid);if(ssidInput!=null&&ssidInput.getText().length()==0)ssidInput.setText(lastSsid);}
    private void wifiSettings(){closeRobot();startActivity(new Intent(Build.VERSION.SDK_INT>=29?Settings.Panel.ACTION_WIFI:Settings.ACTION_WIFI_SETTINGS));}
    private JSONObject form() throws Exception {String raw=urlInput.getText().toString().trim();if(!raw.contains("://"))raw="http://"+raw;URI u=new URI(raw);if(!Arrays.asList("http","https").contains(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null)throw new Exception("Enter an HTTP(S) IP address or URL, without a password.");JSONObject p=new JSONObject();p.put("id",editId);p.put("url",u.toString());p.put("name",nameInput.getText().toString().trim());p.put("ssid",ssidInput.getText().toString().trim());return p;}
    private JSONObject upsert(JSONObject data,boolean opened,String title) throws Exception {
        String id=data.optString("id"),url=data.getString("url"),network=data.optString("ssid"),name=data.optString("name");JSONObject old=null;JSONArray next=new JSONArray();
        for(int i=0;i<robots.length();i++){JSONObject r=robots.getJSONObject(i);if((!id.isEmpty()&&id.equals(r.optString("id")))||(id.isEmpty()&&url.equals(r.optString("url"))&&network.equals(r.optString("ssid"))))old=r;else next.put(r);}
        JSONObject p=new JSONObject();p.put("id",old==null?UUID.randomUUID().toString():old.getString("id"));p.put("url",url);p.put("ssid",network);p.put("name",!name.isEmpty()?name:!title.isEmpty()?title:old!=null?old.optString("name"):!network.isEmpty()?network:URI.create(url).getHost());p.put("lastOpened",opened?System.currentTimeMillis():old==null?0:old.optLong("lastOpened"));next.put(p);robots=next;getPreferences(0).edit().putString("robots",robots.toString()).apply();return p;
    }
    private void openRobot(JSONObject robot) throws Exception {
        String network=robot.optString("ssid"),current=ssid();if(!network.isEmpty()&&!current.isEmpty()&&!network.equals(current)){pending=robot;message("Connect to "+network+". The robot opens when its network is detected.");wifiSettings();return;}
        closeRobot();pending=null;active=robot;proxy=new RobotProxy(robot.getString("url"),network);final RobotProxy openedProxy=proxy;final JSONObject openedRobot=robot;show(false);
        while(driveContent.getChildCount()>1)driveContent.removeViewAt(1);browser=new WebView(this);browser.setBackgroundColor(BG);browser.getSettings().setJavaScriptEnabled(true);browser.getSettings().setDomStorageEnabled(true);browser.getSettings().setAllowFileAccess(false);browser.getSettings().setAllowContentAccess(false);browser.getSettings().setBuiltInZoomControls(true);browser.getSettings().setDisplayZoomControls(false);CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(browser,false);
        browser.setWebChromeClient(new WebChromeClient());browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){String u=request.getUrl().toString();if(openedProxy.owns(u))return false;String local=openedProxy.localUrl(u);if(local!=null)view.loadUrl(local);else message("Open that website address from Settings.");return true;}
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){failed=false;address.setText("Opening "+openedRobot.optString("url"));}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame()){failed=true;message("Robot not reachable. Check Wi-Fi and its address.");}}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400)failed=true;}
            @Override public void onPageFinished(WebView view,String url){if(proxy!=openedProxy)return;address.setText(openedProxy.robotUrl(url));if(!failed)try{active=upsert(openedRobot,true,view.getTitle());renderLibrary();CookieManager.getInstance().flush();}catch(Exception e){message(e.getMessage());}}
            @Override public void onReceivedHttpAuthRequest(WebView view,HttpAuthHandler auth,String host,String realm){LinearLayout fields=column();fields.setPadding(dp(22),dp(10),dp(22),dp(5));EditText user=field(fields,"Username",""),password=field(fields,"Password","");password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);new AlertDialog.Builder(MainActivity.this).setTitle("Sign in to your robot").setMessage(openedRobot.optString("url")+"\n"+realm).setView(fields).setPositiveButton("Sign in",(dialog,which)->auth.proceed(user.getText().toString(),password.getText().toString())).setNegativeButton("Cancel",(dialog,which)->auth.cancel()).setOnCancelListener(dialog->auth.cancel()).show();}
        });driveContent.addView(browser,new LinearLayout.LayoutParams(-1,0,1));browser.loadUrl(proxy.startUrl());
    }
    private void renderLibrary(){if(libraryRows==null)return;libraryRows.removeAllViews();String query=searchInput==null?"":searchInput.getText().toString().toLowerCase(Locale.ROOT);List<JSONObject> entries=new ArrayList<>();for(int i=0;i<robots.length();i++){JSONObject r=robots.optJSONObject(i);if(r!=null&&r.toString().toLowerCase(Locale.ROOT).contains(query))entries.add(r);}entries.sort((a,b)->{int networkOrder=Boolean.compare(b.optString("ssid").equals(lastSsid)&&!lastSsid.isEmpty(),a.optString("ssid").equals(lastSsid)&&!lastSsid.isEmpty());return networkOrder!=0?networkOrder:Long.compare(b.optLong("lastOpened"),a.optLong("lastOpened"));});
        for(JSONObject r:entries){LinearLayout card=column();card.setPadding(dp(14),dp(14),dp(14),dp(14));card.setBackground(background(PANEL));card.addView(text(r.optString("name"),17,TEXT));card.addView(text(r.optString("url"),12,MUTED));card.addView(text(r.optString("ssid","Any network"),11,GREEN));space(card,8);LinearLayout actions=new LinearLayout(this);actions.addView(button("Open ↗",()->{try{openRobot(r);}catch(Exception e){message(e.getMessage());}}),new LinearLayout.LayoutParams(0,dp(44),1));actions.addView(button("Edit",()->{editId=r.optString("id");urlInput.setText(r.optString("url"));nameInput.setText(r.optString("name"));ssidInput.setText(r.optString("ssid"));show(true);}),new LinearLayout.LayoutParams(0,dp(44),1));actions.addView(button("Delete",()->{JSONArray keep=new JSONArray();for(int i=0;i<robots.length();i++){JSONObject p=robots.optJSONObject(i);if(!p.optString("id").equals(r.optString("id")))keep.put(p);}robots=keep;getPreferences(0).edit().putString("robots",robots.toString()).apply();renderLibrary();}),new LinearLayout.LayoutParams(0,dp(44),1));card.addView(actions);libraryRows.addView(card);space(libraryRows,10);}
        if(entries.isEmpty())libraryRows.addView(text("Open a robot website to save its name, URL, and network here.",12,MUTED));
    }
    private void closeRobot(){if(browser!=null){browser.stopLoading();driveContent.removeView(browser);browser.destroy();browser=null;}if(proxy!=null){proxy.close();proxy=null;}active=null;if(address!=null)address.setText("No robot open");if(!settings&&driveContent!=null)emptyDrive();}
    private void updateControllers(){List<String> names=new ArrayList<>();for(int id:InputDevice.getDeviceIds()){InputDevice d=InputDevice.getDevice(id);if(d!=null&&((d.getSources()&InputDevice.SOURCE_GAMEPAD)==InputDevice.SOURCE_GAMEPAD||(d.getSources()&InputDevice.SOURCE_JOYSTICK)==InputDevice.SOURCE_JOYSTICK))if(names.size()<2)names.add(d.getName());}controllers.setText("1: "+(names.size()>0?names.get(0):"No controller")+"    •    2: "+(names.size()>1?names.get(1):"Not connected"));}
    private void message(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
    @Override protected void onResume(){super.onResume();refreshWifi();if(pending!=null&&pending.optString("ssid").equals(ssid()))try{openRobot(pending);}catch(Exception e){message(e.getMessage());}}
    @Override protected void onPause(){super.onPause();closeRobot();}
    @Override protected void onDestroy(){closeRobot();if(inputManager!=null)inputManager.unregisterInputDeviceListener(this);super.onDestroy();}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);refreshWifi();}
    @Override public void onBackPressed(){if(browser!=null&&browser.canGoBack())browser.goBack();else if(!settings)show(true);else super.onBackPressed();}
    public void onInputDeviceAdded(int id){updateControllers();}public void onInputDeviceRemoved(int id){updateControllers();}public void onInputDeviceChanged(int id){updateControllers();}
}
