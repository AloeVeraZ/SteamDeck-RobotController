package com.qualcomm.robotcore.hardware;

import java.util.*;

// Virtual Control Hub stand-in for the FTC SDK 12.0 API (the subset Pedro Pathing and exported
// autonomous code use). Same package, names and signatures; backed by the simulator. Not FIRST code.
public class HardwareMap implements Iterable<HardwareDevice> {
    public class DeviceMapping<T extends HardwareDevice> implements Iterable<T> {
        private final Class<T> type;
        DeviceMapping(Class<T> type) { this.type = type; }
        public T get(String deviceName) { return HardwareMap.this.get(type, deviceName); }
        public Set<Map.Entry<String, T>> entrySet() {
            Map<String, T> out = new LinkedHashMap<>();
            for (Map.Entry<String, HardwareDevice> e : devices.entrySet()) if (type.isInstance(e.getValue())) out.put(e.getKey(), type.cast(e.getValue()));
            return out.entrySet();
        }
        public int size() { return entrySet().size(); }
        @Override public Iterator<T> iterator() {
            List<T> out = new ArrayList<>();
            for (Map.Entry<String, T> e : entrySet()) out.add(e.getValue());
            return out.iterator();
        }
    }
    private final Map<String, HardwareDevice> devices = new LinkedHashMap<>();
    public final DeviceMapping<DcMotor> dcMotor = new DeviceMapping<>(DcMotor.class);
    public final DeviceMapping<VoltageSensor> voltageSensor = new DeviceMapping<>(VoltageSensor.class);

    // On a robot the SDK builds the map from the configuration; the virtual hub subclasses it.
    protected HardwareMap() {}

    public void put(String deviceName, HardwareDevice device) { devices.put(deviceName, device); }

    public <T> T get(Class<? extends T> classOrInterface, String deviceName) {
        T result = tryGet(classOrInterface, deviceName);
        if (result == null) throw new IllegalArgumentException(String.format("Unable to find a hardware device with name \"%s\" and type %s", deviceName, classOrInterface.getSimpleName()));
        return result;
    }
    public <T> T tryGet(Class<? extends T> classOrInterface, String deviceName) {
        HardwareDevice device = devices.get(deviceName);
        return classOrInterface.isInstance(device) ? (T) classOrInterface.cast(device) : null;
    }
    public HardwareDevice get(String deviceName) {
        HardwareDevice device = devices.get(deviceName);
        if (device == null) throw new IllegalArgumentException("Unable to find a hardware device with the name \"" + deviceName + "\"");
        return device;
    }
    public <T> List<T> getAll(Class<? extends T> classOrInterface) {
        List<T> out = new ArrayList<>();
        for (HardwareDevice d : devices.values()) if (classOrInterface.isInstance(d)) out.add(classOrInterface.cast(d));
        return out;
    }
    public Set<String> getNamesOf(HardwareDevice device) {
        Set<String> out = new LinkedHashSet<>();
        for (Map.Entry<String, HardwareDevice> e : devices.entrySet()) if (e.getValue() == device) out.add(e.getKey());
        return out;
    }
    public int size() { return devices.size(); }
    @Override public Iterator<HardwareDevice> iterator() { return new ArrayList<>(devices.values()).iterator(); }
}
