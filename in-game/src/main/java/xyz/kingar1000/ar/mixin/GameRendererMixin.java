package xyz.kingar1000.ar.mixin;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import xyz.kingar1000.ar.ArClient;
@Mixin(GameRenderer.class)
public class GameRendererMixin {
 @Inject(method="getFov",at=@At("RETURN"),cancellable=true)
 private void ar$zoom(Camera camera,float tickProgress,boolean changingFov,CallbackInfoReturnable<Float> cir){if(ArClient.zoom!=null&&ArClient.zoom.isPressed()&&MinecraftClient.getInstance().currentScreen==null)cir.setReturnValue(cir.getReturnValue()/4f);}
}
