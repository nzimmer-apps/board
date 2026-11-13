package com.nzimmerapps.board;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareIntentPlugin.class);
        super.onCreate(savedInstanceState);
        String text = extract(getIntent());
        if (text != null) ShareIntentPlugin.setPending(text);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String text = extract(intent);
        if (text == null) return;
        PluginHandle h = getBridge() == null ? null : getBridge().getPlugin("ShareIntent");
        if (h != null && h.getInstance() instanceof ShareIntentPlugin) {
            ((ShareIntentPlugin) h.getInstance()).emit(text);
        } else {
            ShareIntentPlugin.setPending(text);
        }
    }

    private static String extract(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        CharSequence body = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        StringBuilder sb = new StringBuilder();
        if (subject != null && !subject.trim().isEmpty()) sb.append(subject.trim());
        if (body != null && body.toString().trim().length() > 0) {
            String b = body.toString().trim();
            if (sb.length() == 0 || !b.contains(sb.toString())) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(b);
            } else {
                sb.setLength(0);
                sb.append(b);
            }
        }
        intent.setAction(Intent.ACTION_MAIN); // don't re-save on rotation/recreate
        return sb.length() == 0 ? null : sb.toString();
    }
}
