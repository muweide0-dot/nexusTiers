package com.nexustiers.client;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class NexusTiersClient implements ClientModInitializer {
    public static final Map<String, String> BEST_TIERS = new ConcurrentHashMap<>();
    public static final Gson GSON = new Gson();
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static KeyBinding lookupKey;

    @Override
    public void onInitializeClient() {
        lookupKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.nexustiers.lookup",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_N,
                "category.nexustiers"
        ));
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (lookupKey.wasPressed()) {
                client.setScreen(new NexusTiersLookupScreen());
            }
        });
    }

    public static String bestTier(String username) {
        return BEST_TIERS.getOrDefault(username.toLowerCase(), "N/A");
    }

    public static void fetchProfile(String ign, java.util.function.Consumer<PlayerTierProfile> callback) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(NexusTiersConfig.API_BASE_URL + "/players/" + urlEncode(ign) + "/tiers"))
                .header("Accept", "application/json")
                .GET()
                .build();
        HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(HttpResponse::body)
                .thenApply(body -> {
                    try {
                        return GSON.fromJson(body, PlayerTierProfile.class);
                    } catch (JsonSyntaxException exception) {
                        return null;
                    }
                })
                .thenAccept(profile -> {
                    if (profile != null) {
                        BEST_TIERS.put(profile.ign().toLowerCase(), profile.bestTier());
                        callback.accept(profile);
                    }
                });
    }

    private static String urlEncode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }
}