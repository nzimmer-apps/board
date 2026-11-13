package com.nzimmerapps.board;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Hands text shared from other apps (Android share sheet) to the web layer. */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {
    private static String pending = null;

    static void setPending(String text) { pending = text; }

    /** Called by the web app on startup: returns any share that launched the app, then clears it. */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("text", pending);
        pending = null;
        call.resolve(ret);
    }

    /** Called by MainActivity when a share arrives while the app is already open. */
    void emit(String text) {
        JSObject data = new JSObject();
        data.put("text", text);
        notifyListeners("shared", data, true);
    }
}
