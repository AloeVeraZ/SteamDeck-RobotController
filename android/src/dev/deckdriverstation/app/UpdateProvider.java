package dev.deckdriverstation.app;
import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Only the single verified APK can be shared, read-only, with Android's installer. */
public final class UpdateProvider extends ContentProvider {
    public boolean onCreate(){return true;}
    private File file(Uri uri) throws FileNotFoundException {if(!"/apk".equals(uri.getPath()))throw new FileNotFoundException();File f=new File(getContext().getCacheDir(),"verified-update/update.apk");if(!f.isFile())throw new FileNotFoundException();return f;}
    public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {if(!"r".equals(mode))throw new FileNotFoundException("Read only");return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
    public String getType(Uri uri){return "application/vnd.android.package-archive";}
    public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){try{File f=file(uri);String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor cursor=new MatrixCursor(columns);Object[] values=new Object[columns.length];for(int i=0;i<columns.length;i++)values[i]=OpenableColumns.DISPLAY_NAME.equals(columns[i])?"DeckDriverStation-update.apk":OpenableColumns.SIZE.equals(columns[i])?f.length():null;cursor.addRow(values);return cursor;}catch(FileNotFoundException e){return null;}}
    public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException();}public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException();}
}
