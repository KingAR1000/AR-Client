package xyz.kingar1000.ar.mixin;
import net.minecraft.client.Mouse;
import net.minecraft.client.input.MouseInput;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import xyz.kingar1000.ar.ArClient;
@Mixin(Mouse.class)
public class MouseMixin {
 @Inject(method="onMouseButton",at=@At("HEAD"))
 private void ar$countClick(long window,MouseInput input,int action,CallbackInfo ci){if(action==1)ArClient.click(input.button());}
}
