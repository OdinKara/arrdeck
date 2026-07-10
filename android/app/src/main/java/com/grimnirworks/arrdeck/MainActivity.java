package com.grimnirworks.arrdeck;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String PREFS = "arrdeck.webview";
    private static final String KEY_LAST_VERSION = "lastVersionCode";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        clearWebViewCacheOnUpdate();
    }

    /**
     * WHY: Capacitor bundles the web build (dist/: index.html + content-hashed
     * JS/CSS) into the APK and serves it through a local server, and the Android
     * WebView HTTP-caches those assets. That cache lives in the app's data dir and
     * SURVIVES an APK update (updates don't wipe app data). The entry file
     * `index.html` has a FIXED url, so after an update the WebView can keep serving
     * the OLD cached index.html — which still points at the OLD hashed bundle — and
     * the user sees the previous UI until they clear data / force-stop. (The hashed
     * assets alone can't save us: index.html is the one unhashed file that pins the
     * app to a version, and it's the one that gets cached.)
     *
     * FIX: detect an app-version change (the first launch after an update) and, only
     * then, clear the WebView cache and reload so the freshly-installed bundle is
     * read from disk. Runs at most once per update — normal in-session caching is
     * left completely intact.
     */
    private void clearWebViewCacheOnUpdate() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        long lastVersion = prefs.getLong(KEY_LAST_VERSION, -1L);
        long currentVersion = currentVersionCode();

        if (currentVersion != -1L && lastVersion != currentVersion) {
            if (getBridge() != null && getBridge().getWebView() != null) {
                // clearCache(true) drops the disk + memory HTTP cache for this WebView;
                // reload() then re-reads index.html + the new hashed bundle fresh.
                getBridge().getWebView().clearCache(true);
                getBridge().getWebView().reload();
            }
            prefs.edit().putLong(KEY_LAST_VERSION, currentVersion).apply();
        }
    }

    /** The installed APK's versionCode (from build.gradle), via PackageManager. */
    private long currentVersionCode() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return info.getLongVersionCode();
            }
            return legacyVersionCode(info);
        } catch (Exception e) {
            return -1L;
        }
    }

    @SuppressWarnings("deprecation")
    private long legacyVersionCode(PackageInfo info) {
        return info.versionCode;
    }
}
