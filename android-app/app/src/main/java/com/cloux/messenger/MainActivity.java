package com.cloux.messenger;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import java.util.ArrayList;
import java.util.List;

/** Cloux native shell. Loads only the HTTPS Cloux service; call permissions require user approval. */
public class MainActivity extends Activity {
    private static final String HOST = "cloux-messenger.onrender.com";
    private static final int REQUEST_CALL_PERMISSIONS = 401;
    private WebView web;
    private PermissionRequest pendingCall;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF09090B);
        getWindow().setNavigationBarColor(0xFF09090B);

        web = new WebView(this);
        web.setBackgroundColor(0xFF09090B);
        web.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri uri=req.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme()) && HOST.equalsIgnoreCase(uri.getHost())) return false;
                if ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) {
                    try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> checkMediaPermission(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if(pendingCall==request)pendingCall=null;
            }
        });
        if(state!=null)web.restoreState(state);
        else web.loadUrl("https://"+HOST+"/");
    }

    private void checkMediaPermission(PermissionRequest req) {
        Uri origin=req.getOrigin();
        if (!"https".equalsIgnoreCase(origin.getScheme()) || !HOST.equalsIgnoreCase(origin.getHost())) {
            req.deny(); return;
        }
        List<String> needs=new ArrayList<>();
        for(String resource:req.getResources()) {
            if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)
                    needs.add(Manifest.permission.RECORD_AUDIO);
            } else if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)
                    needs.add(Manifest.permission.CAMERA);
            } else { req.deny(); return; }
        }
        if(needs.isEmpty()) grantAllowed(req);
        else {
            pendingCall=req;
            requestPermissions(needs.toArray(new String[0]),REQUEST_CALL_PERMISSIONS);
        }
    }

    private void grantAllowed(PermissionRequest req) {
        List<String> resources=new ArrayList<>();
        for(String resource:req.getResources()){
            if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) &&
                    checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)
                resources.add(resource);
            if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) &&
                    checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)
                resources.add(resource);
        }
        if(resources.size()==req.getResources().length)req.grant(resources.toArray(new String[0]));
        else req.deny();
    }

    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
        super.onRequestPermissionsResult(code,permissions,results);
        if(code==REQUEST_CALL_PERMISSIONS && pendingCall!=null){
            PermissionRequest req=pendingCall;pendingCall=null;
            grantAllowed(req);
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        web.saveState(out);super.onSaveInstanceState(out);
    }
    @Override public void onBackPressed() {
        if(web.canGoBack())web.goBack();
        else super.onBackPressed();
    }
    @Override public void onDestroy() {
        if(web!=null){web.stopLoading();web.destroy();web=null;}
        super.onDestroy();
    }
}
