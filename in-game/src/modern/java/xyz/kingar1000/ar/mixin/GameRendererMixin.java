package xyz.kingar1000.ar.mixin;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import xyz.kingar1000.ar.ArClient;
@Mixin(Camera.class)
public class GameRendererMixin {
 @Inject(method="getFov()F",at=@At("RETURN"),cancellable=true)
 private void ar$zoom(CallbackInfoReturnable<Float> cir) {
  if(ArClient.zoom != null && ArClient.zoom.isDown() && Minecraft.getInstance().gui.screen() == null)
   cir.setReturnValue(cir.getReturnValue()/4f);
 }
}
