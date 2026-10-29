package xyz.kingar1000.ar;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;
public final class HudEditor extends Screen {
 private ArClient.Widget dragging;
 public HudEditor(){super(Component.literal("AR Client · HUD Editor"));}
 @Override protected void init(){addRenderableWidget(Button.builder(Component.literal("Show all widgets"),b->{for(var w:ArClient.layout.widgets)w.enabled=true;}).bounds(10,height-30,130,20).build());addRenderableWidget(Button.builder(Component.literal("Save & return"),b->{ArClient.save();onClose();}).bounds(width/2-70,height-30,140,20).build());}
 @Override public void extractRenderState(GuiGraphicsExtractor ctx,int mouseX,int mouseY,float delta){ctx.fill(0,0,width,height,0x99101010);ctx.centeredText(font,"AR CLIENT / HUD EDITOR",width/2,12,0xffffffff);ctx.centeredText(font,"Drag to move · Scroll to scale · Right-click to hide · Escape to save",width/2,27,0xffaaaaaa);ArClient.render(ctx,true);super.extractRenderState(ctx,mouseX,mouseY,delta);}
 @Override public boolean mouseClicked(MouseButtonEvent click,boolean doubled){for(ArClient.Widget w:ArClient.layout.widgets){if(!w.enabled)continue;double x=w.x*width,y=w.y*height;if(click.x()>=x-4&&click.x()<=x+(font.width(ArClient.text(w))+4)*w.scale&&click.y()>=y-3&&click.y()<=y+13*w.scale){if(click.button()==ArClient.RIGHT_BUTTON){w.enabled=false;return true;}dragging=w;return true;}}return super.mouseClicked(click,doubled);}
 @Override public boolean mouseDragged(MouseButtonEvent click,double offsetX,double offsetY){if(dragging!=null){dragging.x=ArClient.clamp(click.x()/width,0,.95);dragging.y=ArClient.clamp(click.y()/height,0,.95);return true;}return super.mouseDragged(click,offsetX,offsetY);}
 @Override public boolean mouseReleased(MouseButtonEvent click){dragging=null;return super.mouseReleased(click);}
 @Override public boolean mouseScrolled(double x,double y,double horizontal,double vertical){for(ArClient.Widget w:ArClient.layout.widgets){if(w.enabled&&x>=w.x*width-4&&x<=w.x*width+font.width(ArClient.text(w))*w.scale+4&&y>=w.y*height-3&&y<=w.y*height+13*w.scale){w.scale=ArClient.clamp(w.scale+vertical*.1,.5,3);return true;}}return super.mouseScrolled(x,y,horizontal,vertical);}
 @Override public void onClose(){ArClient.save();super.onClose();}
 @Override public boolean isPauseScreen(){return false;}
}
