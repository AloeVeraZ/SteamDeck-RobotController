# Asks Windows to rescan Wi-Fi (WlanScan), like opening the taskbar Wi-Fi list, so netsh sees nearby networks.
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class DeckWlan{
  [DllImport("wlanapi.dll")] static extern uint WlanOpenHandle(uint version,IntPtr reserved,out uint negotiated,out IntPtr handle);
  [DllImport("wlanapi.dll")] static extern uint WlanEnumInterfaces(IntPtr handle,IntPtr reserved,out IntPtr list);
  [DllImport("wlanapi.dll")] static extern uint WlanScan(IntPtr handle,ref Guid iface,IntPtr ssid,IntPtr ie,IntPtr reserved);
  [DllImport("wlanapi.dll")] static extern void WlanFreeMemory(IntPtr memory);
  [DllImport("wlanapi.dll")] static extern uint WlanCloseHandle(IntPtr handle,IntPtr reserved);
  public static int Scan(){
    uint negotiated;IntPtr handle;if(WlanOpenHandle(2,IntPtr.Zero,out negotiated,out handle)!=0)return -1;
    int started=0;IntPtr list;
    if(WlanEnumInterfaces(handle,IntPtr.Zero,out list)==0){
      int count=Marshal.ReadInt32(list);
      // WLAN_INTERFACE_INFO_LIST: two DWORDs, then 532-byte entries starting with the interface GUID.
      for(int i=0;i<count;i++){Guid id=(Guid)Marshal.PtrToStructure(new IntPtr(list.ToInt64()+8+i*532),typeof(Guid));if(WlanScan(handle,ref id,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero)==0)started++;}
      WlanFreeMemory(list);
    }
    WlanCloseHandle(handle,IntPtr.Zero);return started;
  }
}
'@
[DeckWlan]::Scan()
