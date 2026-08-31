package com.nexustiers.client.mixin;

import com.nexustiers.client.NexusTiersClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Adds the latest known tier to the player name-tag line. The cache is filled
 * by the lookup screen and can also be populated by a future server sync.
 */
@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerEntityRendererMixin {
    @Inject(method = "renderLabelIfPresent", at = @At("HEAD"))
    private void nexustiers$warmTierCache(
            AbstractClientPlayerEntity player,
            Text text,
            MatrixStack matrices,
            VertexConsumerProvider vertexConsumers,
            int light,
            CallbackInfo callbackInfo
    ) {
        String tier = NexusTiersClient.bestTier(player.getGameProfile().getName());
        if ("N/A".equals(tier)) {
            NexusTiersClient.fetchProfile(player.getGameProfile().getName(), ignored -> {});
        } else {
            /*
             * The vanilla renderer uses the entity's custom name when it
             * builds the name-tag line. Setting it here keeps the badge next
             * to the normal username without replacing the vanilla renderer.
             */
            player.setCustomName(Text.literal("⚔ " + tier + "  " + player.getGameProfile().getName()));
            player.setCustomNameVisible(true);
        }
    }
}