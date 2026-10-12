package com.cloux.messenger;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/** Keeps the authenticated Cloux inbox connected while Android backgrounds the WebView. */
public final class ClouxInboxService extends Service {
    private static final String HOST="cloux-messenger.onrender.com";
    private static final String BASE="https://"+HOST;
    private static final String ACTION_START="com.cloux.messenger.START_INBOX";
    private static final String EXTRA_USER="user_id";
    private static final String PREFS="cloux_inbox";
    private static final String SERVICE_CHANNEL="cloux_sync_v1";
    private static final String MESSAGE_CHANNEL="cloux_messages_v2";
    private static final int FOREGROUND_ID=5101;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final OkHttpClient client=new OkHttpClient.Builder()
        .readTimeout(0,TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .build();
    private WebSocket socket;
    private String userId="";
    private boolean stopped;

    private final Runnable pingTask=new Runnable(){
        @Override public void run(){
            WebSocket current=socket;
            if(!stopped && current!=null)current.send("ping");
            if(!stopped)handler.postDelayed(this,25000);
        }
    };
    private final Runnable reconnectTask=()->connectInbox();

    @Override public void onCreate(){super.onCreate();createChannels();}

    @Override public int onStartCommand(Intent intent,int flags,int startId){
        String requested=intent==null?null:intent.getStringExtra(EXTRA_USER);
        if(requested!=null && requested.matches("[A-Za-z0-9_-]{1,80}"))userId=requested;
        if(userId.isEmpty())userId=getSharedPreferences(PREFS,MODE_PRIVATE).getString("active_user","");
        if(userId.isEmpty()){stopSelf();return START_NOT_STICKY;}
        getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString("active_user",userId).apply();
        stopped=false;
        Notification ongoing=new Notification.Builder(this,SERVICE_CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Cloux працює у фоні")
            .setContentText("Очікуємо нові повідомлення")
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(true)
            .setContentIntent(openAppIntent())
            .build();
        if(Build.VERSION.SDK_INT>=34)
            startForeground(FOREGROUND_ID,ongoing,ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
        else startForeground(FOREGROUND_ID,ongoing);
        connectInbox();
        return START_STICKY;
    }

    private PendingIntent openAppIntent(){
        Intent open=new Intent(this,MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this,FOREGROUND_ID,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }

    private void createChannels(){
        if(Build.VERSION.SDK_INT<26)return;
        NotificationManager manager=getSystemService(NotificationManager.class);
        if(manager==null)return;
        NotificationChannel service=new NotificationChannel(SERVICE_CHANNEL,"Фонове з’єднання Cloux",NotificationManager.IMPORTANCE_LOW);
        service.setDescription("Підтримує доставку повідомлень у фоні");
        service.setSound(null,null);
        manager.createNotificationChannel(service);
        Uri sound=Uri.parse("android.resource://"+getPackageName()+"/"+R.raw.cloux_message);
        AudioAttributes attributes=new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        NotificationChannel messages=new NotificationChannel(MESSAGE_CHANNEL,"Повідомлення Cloux",NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription("Нові повідомлення зі звуком Cloux");
        messages.enableVibration(true);
        messages.setVibrationPattern(new long[]{0,120,70,140});
        messages.setSound(sound,attributes);
        manager.createNotificationChannel(messages);
    }

    private void connectInbox(){
        if(stopped || socket!=null)return;
        String cookie=CookieManager.getInstance().getCookie(BASE);
        if(cookie==null || !cookie.contains("cloux_session=")){scheduleReconnect();return;}
        Request request=new Request.Builder().url("wss://"+HOST+"/ws/inbox").header("Cookie",cookie).build();
        socket=client.newWebSocket(request,new WebSocketListener(){
            @Override public void onOpen(WebSocket webSocket,Response response){
                socket=webSocket;
                handler.removeCallbacks(reconnectTask);
                handler.removeCallbacks(pingTask);
                handler.postDelayed(pingTask,25000);
                fetchChats(true);
            }
            @Override public void onMessage(WebSocket webSocket,String text){
                try{if("inbox_update".equals(new JSONObject(text).optString("type")))fetchChats(true);}catch(Exception ignored){}
            }
            @Override public void onClosed(WebSocket webSocket,int code,String reason){socket=null;scheduleReconnect();}
            @Override public void onFailure(WebSocket webSocket,Throwable error,Response response){socket=null;scheduleReconnect();}
        });
    }

    private void scheduleReconnect(){
        if(!stopped){handler.removeCallbacks(reconnectTask);handler.postDelayed(reconnectTask,5000);}
    }

    private void fetchChats(boolean allowNotifications){
        String cookie=CookieManager.getInstance().getCookie(BASE);
        if(cookie==null || !cookie.contains("cloux_session="))return;
        Request request=new Request.Builder().url(BASE+"/api/chats").header("Cookie",cookie).get().build();
        client.newCall(request).enqueue(new okhttp3.Callback(){
            @Override public void onFailure(okhttp3.Call call,java.io.IOException error){}
            @Override public void onResponse(okhttp3.Call call,Response response){
                try(response){
                    if(response.code()==401){stopSelf();return;}
                    if(!response.isSuccessful() || response.body()==null)return;
                    JSONObject root=new JSONObject(response.body().string());
                    JSONArray chats=root.optJSONArray("chats");
                    if(chats==null)return;
                    android.content.SharedPreferences prefs=getSharedPreferences(PREFS,MODE_PRIVATE);
                    android.content.SharedPreferences.Editor edit=prefs.edit();
                    for(int i=0;i<chats.length();i++){
                        JSONObject chat=chats.optJSONObject(i);if(chat==null)continue;
                        String id=chat.optString("id","");if(id.isEmpty())continue;
                        long latest=chat.optLong("last_message_id",0);
                        String key="last:"+userId+":"+id;
                        boolean known=prefs.contains(key);long previous=prefs.getLong(key,0);
                        if(allowNotifications && known && latest>previous && !userId.equals(chat.optString("last_sender")) && chat.optInt("muted",0)==0)
                            showMessage(chat.optString("title","Cloux"),chat.optString("last_text","Нове повідомлення"),id);
                        if(!known || latest>previous)edit.putLong(key,latest);
                    }
                    edit.apply();
                }catch(Exception ignored){}
            }
        });
    }

    private void showMessage(String title,String body,String chatId){
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
        NotificationManager manager=getSystemService(NotificationManager.class);if(manager==null)return;
        Notification notification=new Notification.Builder(this,MESSAGE_CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(title.isEmpty()?"Cloux":title)
            .setContentText(body.isEmpty()?"Нове повідомлення":body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(openAppIntent())
            .setAutoCancel(true)
            .build();
        manager.notify(chatId.hashCode(),notification);
    }

    @Override public void onDestroy(){
        stopped=true;handler.removeCallbacks(pingTask);handler.removeCallbacks(reconnectTask);
        if(socket!=null){socket.close(1000,"service stopped");socket=null;}
        client.dispatcher().cancelAll();
        getSharedPreferences(PREFS,MODE_PRIVATE).edit().remove("active_user").apply();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent){return null;}

    public static Intent startIntent(android.content.Context context,String userId){
        return new Intent(context,ClouxInboxService.class).setAction(ACTION_START).putExtra(EXTRA_USER,userId);
    }
}
