use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

pub const DPI_PROXY_PORT: u16 = 10850;
static IS_RUNNING: AtomicBool = AtomicBool::new(false);

pub fn start_dpi_proxy() {
    if IS_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(|| {
        let listener = match TcpListener::bind(format!("127.0.0.1:{}", DPI_PROXY_PORT)) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[Rustcord DPI] Failed to bind local proxy: {}", e);
                IS_RUNNING.store(false, Ordering::Relaxed);
                return;
            }
        };

        println!("[Rustcord DPI] Local anti-block bypass active on 127.0.0.1:{}", DPI_PROXY_PORT);

        for stream in listener.incoming() {
            if !IS_RUNNING.load(Ordering::Relaxed) {
                break;
            }
            if let Ok(client) = stream {
                thread::spawn(|| {
                    let _ = handle_socks5_client(client);
                });
            }
        }
    });
}

#[allow(dead_code)]
pub fn stop_dpi_proxy() {
    IS_RUNNING.store(false, Ordering::SeqCst);
}

fn handle_socks5_client(mut client: TcpStream) -> std::io::Result<()> {
    client.set_nodelay(true)?;

    let mut buf = [0u8; 256];
    let n = client.read(&mut buf)?;
    if n < 2 || buf[0] != 0x05 {
        return Ok(());
    }

    client.write_all(&[0x05, 0x00])?;
    client.flush()?;

    let n = client.read(&mut buf)?;
    if n < 7 || buf[0] != 0x05 || buf[1] != 0x01 {
        return Ok(());
    }

    let target_addr: String;
    let target_port: u16;

    match buf[3] {
        0x01 => {
            if n < 10 { return Ok(()); }
            let ip = format!("{}.{}.{}.{}", buf[4], buf[5], buf[6], buf[7]);
            target_port = u16::from_be_bytes([buf[8], buf[9]]);
            target_addr = ip;
        }
        0x03 => {
            let domain_len = buf[4] as usize;
            if n < 5 + domain_len + 2 { return Ok(()); }
            let domain = String::from_utf8_lossy(&buf[5..5 + domain_len]).to_string();
            target_port = u16::from_be_bytes([buf[5 + domain_len], buf[5 + domain_len + 1]]);
            
            target_addr = if domain.ends_with("discord.com") || domain.ends_with("discordapp.com") || domain.ends_with("discord.gg") {
                "162.159.130.233".to_string()
            } else {
                domain
            };
        }
        _ => return Ok(()),
    }

    let dest_target = format!("{}:{}", target_addr, target_port);
    let mut dest = match TcpStream::connect(&dest_target) {
        Ok(s) => s,
        Err(_) => {
            let _ = client.write_all(&[0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
            return Ok(());
        }
    };
    dest.set_nodelay(true)?;

    client.write_all(&[0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0])?;
    client.flush()?;

    let mut first_buf = [0u8; 4096];
    let n = client.read(&mut first_buf)?;
    if n > 0 {
        if n > 5 && first_buf[0] == 0x16 && first_buf[1] == 0x03 {
            dest.write_all(&first_buf[..2])?;
            dest.flush()?;
            thread::sleep(Duration::from_millis(5));
            dest.write_all(&first_buf[2..n])?;
            dest.flush()?;
        } else {
            dest.write_all(&first_buf[..n])?;
            dest.flush()?;
        }
    }

    let mut client_clone = client.try_clone()?;
    let mut dest_clone = dest.try_clone()?;

    let t1 = thread::spawn(move || {
        let mut b = [0u8; 8192];
        while let Ok(r) = client_clone.read(&mut b) {
            if r == 0 { break; }
            if dest_clone.write_all(&b[..r]).is_err() { break; }
        }
        let _ = dest_clone.shutdown(std::net::Shutdown::Both);
    });

    let mut b = [0u8; 8192];
    while let Ok(r) = dest.read(&mut b) {
        if r == 0 { break; }
        if client.write_all(&b[..r]).is_err() { break; }
    }
    let _ = client.shutdown(std::net::Shutdown::Both);
    let _ = t1.join();

    Ok(())
}
