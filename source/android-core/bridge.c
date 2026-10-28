#include <jni.h>
#include <stdlib.h>
#include <string.h>
extern char* PawStart(char*, char*);
extern void PawStop(void);
extern void PawResetNetwork(void);
extern void PawSetSystemDNS(char*);
extern char* PawStats(void);
extern int PawProbe(char*);
extern char* PawSwitch(char*);
extern char* PawDiagnostics(void);
extern char* PawDumpStacks(char*);
JNIEXPORT jstring JNICALL Java_com_pawlink_android_NativeCore_start(JNIEnv* env, jobject self, jstring home, jstring config) {
 const char* h=(*env)->GetStringUTFChars(env,home,0);
 const char* c=(*env)->GetStringUTFChars(env,config,0);
 char* error=PawStart((char*)h,(char*)c);
 (*env)->ReleaseStringUTFChars(env,home,h);
 (*env)->ReleaseStringUTFChars(env,config,c);
 jstring result=(*env)->NewStringUTF(env,error);
 free(error);
 return result;
}
JNIEXPORT void JNICALL Java_com_pawlink_android_NativeCore_stop(JNIEnv* env, jobject self) {PawStop();}
JNIEXPORT void JNICALL Java_com_pawlink_android_NativeCore_resetNetwork(JNIEnv* env, jobject self) {PawResetNetwork();}
JNIEXPORT void JNICALL Java_com_pawlink_android_NativeCore_setSystemDns(JNIEnv* env, jobject self, jstring list) {
 const char* l=(*env)->GetStringUTFChars(env,list,0);
 PawSetSystemDNS((char*)l);
 (*env)->ReleaseStringUTFChars(env,list,l);
}
JNIEXPORT jstring JNICALL Java_com_pawlink_android_NativeCore_stats(JNIEnv* env, jobject self) {
 char* value=PawStats();
 jstring result=(*env)->NewStringUTF(env,value);
 free(value);
 return result;
}
JNIEXPORT jint JNICALL Java_com_pawlink_android_NativeCore_probe(JNIEnv* env, jobject self, jstring json) {
 const char* text=(*env)->GetStringUTFChars(env,json,0);
 int result=PawProbe((char*)text);
 (*env)->ReleaseStringUTFChars(env,json,text);
 return result;
}
JNIEXPORT jstring JNICALL Java_com_pawlink_android_NativeCore_diagnostics(JNIEnv* env, jobject self) {
 char* value=PawDiagnostics();
 jstring result=(*env)->NewStringUTF(env,value);
 free(value);
 return result;
}
JNIEXPORT jstring JNICALL Java_com_pawlink_android_NativeCore_dumpStacks(JNIEnv* env, jobject self, jstring path) {
 const char* p=(*env)->GetStringUTFChars(env,path,0);
 char* value=PawDumpStacks((char*)p);
 (*env)->ReleaseStringUTFChars(env,path,p);
 jstring result=(*env)->NewStringUTF(env,value);
 free(value);
 return result;
}
JNIEXPORT jstring JNICALL Java_com_pawlink_android_NativeCore_switchProxy(JNIEnv* env, jobject self, jstring json) {
 const char* text=(*env)->GetStringUTFChars(env,json,0);
 char* error=PawSwitch((char*)text);
 (*env)->ReleaseStringUTFChars(env,json,text);
 jstring result=(*env)->NewStringUTF(env,error);
 free(error);
 return result;
}


static JavaVM* paw_vm=NULL;
static jclass paw_core_class=NULL;
static jmethodID paw_owner_method=NULL;
JNIEXPORT jint JNI_OnLoad(JavaVM* vm, void* reserved) {paw_vm=vm;return JNI_VERSION_1_6;}
JNIEXPORT void JNICALL Java_com_pawlink_android_NativeCore_initOwner(JNIEnv* env, jobject self) {
 if(paw_owner_method)return;
 jclass local=(*env)->FindClass(env,"com/pawlink/android/NativeCore");
 if(!local){(*env)->ExceptionClear(env);return;}
 paw_core_class=(jclass)(*env)->NewGlobalRef(env,local);
 (*env)->DeleteLocalRef(env,local);
 paw_owner_method=(*env)->GetStaticMethodID(env,paw_core_class,"ownerPackage","(ILjava/lang/String;ILjava/lang/String;I)Ljava/lang/String;");
 if(!paw_owner_method)(*env)->ExceptionClear(env);
}
char* pawOwnerPackage(int protocol, char* source, int sourcePort, char* destination, int destinationPort) {
 if(!paw_vm||!paw_core_class||!paw_owner_method)return NULL;
 JNIEnv* env=NULL;int attached=0;
 if((*paw_vm)->GetEnv(paw_vm,(void**)&env,JNI_VERSION_1_6)!=JNI_OK){
  if((*paw_vm)->AttachCurrentThread(paw_vm,&env,NULL)!=JNI_OK)return NULL;
  attached=1;
 }
 char* out=NULL;
 jstring src=(*env)->NewStringUTF(env,source);
 jstring dst=(*env)->NewStringUTF(env,destination);
 jstring name=(jstring)(*env)->CallStaticObjectMethod(env,paw_core_class,paw_owner_method,(jint)protocol,src,(jint)sourcePort,dst,(jint)destinationPort);
 if((*env)->ExceptionCheck(env)){(*env)->ExceptionClear(env);}
 else if(name){
  const char* chars=(*env)->GetStringUTFChars(env,name,0);
  if(chars){out=strdup(chars);(*env)->ReleaseStringUTFChars(env,name,chars);}
  (*env)->DeleteLocalRef(env,name);
 }
 if(src)(*env)->DeleteLocalRef(env,src);
 if(dst)(*env)->DeleteLocalRef(env,dst);
 if(attached)(*paw_vm)->DetachCurrentThread(paw_vm);
 return out;
}
